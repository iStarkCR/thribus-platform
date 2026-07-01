#!/usr/bin/env node
/**
 * Ponte Telegram → Bukowiski (mesma fila do painel).
 *
 * Roda no SEU Mac, lado a lado com `bukowiski-bridge.mjs`. NÃO fala com o Claude
 * direto: ele só faz o transporte Telegram ↔ tabela `collaborator_messages`.
 * Quem processa continua sendo a ponte (claude --resume, persona, custo, etc.).
 *
 * Fluxo:
 *   entrada (você no Telegram)
 *     1. recebe a msg (long-polling getUpdates) — texto ou áudio
 *     2. áudio → baixa + transcreve (Whisper)
 *     3. garante uma chat_sessions pra esse chat do Telegram
 *     4. insere collaborator_messages (role='user', status='pending', channel='telegram')
 *   saída (resposta do Bukowiski)
 *     5. a bukowiski-bridge processa e grava role='assistant' status='done'
 *     6. este adapter detecta a resposta nova e devolve no Telegram
 *        - se a SUA mensagem foi áudio → manda texto + áudio (TTS)
 *        - se foi texto → manda só texto
 *
 * Pré-requisito: `bukowiski-bridge.mjs` precisa estar rodando (é ela que responde).
 *
 * Setup (1x) — ~/.thribus/telegram-bridge.env  (NÃO versionar):
 *   export SUPABASE_URL="https://tidthojvieogbvdtlwvj.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # backend-only (bypassa RLS)
 *   export TELEGRAM_BOT_TOKEN="123456:ABC..."          # token do @BotFather
 *   export THRIBUS_USER_ID="<uuid do Charles em auth.users>"
 *   export OPENAI_API_KEY="sk-..."                      # Whisper (transcrição) + TTS
 *   # allowlist de quem pode falar com o bot (segurança). Vazio = modo bootstrap:
 *   # o bot responde com o seu chat_id pra você preencher aqui.
 *   export TELEGRAM_ALLOWED_CHAT_IDS="123456789"        # separe por vírgula se mais de um
 *   # opcionais:
 *   export BUKOWISKI_AGENT_ID="bukowiski-thribus"
 *   export TELEGRAM_TTS_VOICE="onyx"                    # voz do TTS (OpenAI)
 *
 * Uso:
 *   source ~/.thribus/telegram-bridge.env && node scripts/telegram-bridge.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const USER_ID = process.env.THRIBUS_USER_ID;
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const AGENT_ID = process.env.BUKOWISKI_AGENT_ID || 'bukowiski-thribus';
const TTS_VOICE = process.env.TELEGRAM_TTS_VOICE || 'onyx';
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

if (!URL || !KEY || !BOT || !USER_ID) {
  console.error(
    'Faltam variáveis. Necessárias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ' +
      'TELEGRAM_BOT_TOKEN, THRIBUS_USER_ID. Veja o cabeçalho do arquivo.',
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const API = `https://api.telegram.org/bot${BOT}`;
const FILE_API = `https://api.telegram.org/file/bot${BOT}`;
const OUTBOUND_POLL_MS = 2000;

// ─── Mapa de sessões: telegram chat_id → { sessionId, lastDeliveredAt, replyWithVoice }
const STATE_FILE = join(homedir(), '.thribus/telegram-sessions.json');
let state = {};
try {
  state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
} catch {
  state = {};
}
function saveState() {
  try {
    mkdirSync(join(homedir(), '.thribus'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[state] falha ao salvar:', e.message);
  }
}

// ─── Telegram helpers ───────────────────────────────────────────────────────
async function tg(method, params) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function sendAction(chatId, action) {
  try {
    await tg('sendChatAction', { chat_id: chatId, action });
  } catch {
    /* best-effort */
  }
}

// Telegram corta em 4096 chars. Quebra preferindo \n, e tenta Markdown com
// fallback pra texto plano (a ponte devolve markdown rico, inclusive tabelas).
function chunk(text, max = 3800) {
  const out = [];
  let s = text;
  while (s.length > max) {
    let cut = s.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s.trim()) out.push(s);
  return out;
}

async function sendText(chatId, text) {
  for (const part of chunk(text)) {
    let res = await tg('sendMessage', {
      chat_id: chatId,
      text: part,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    if (!res.ok) {
      // markdown inválido (tabela, char solto) → reenvia como texto plano
      res = await tg('sendMessage', {
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
      });
    }
    if (!res.ok) console.error('[tg sendMessage]', res.description);
  }
}

async function sendVoice(chatId, oggBuffer) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('voice', new Blob([oggBuffer], { type: 'audio/ogg' }), 'bukowiski.ogg');
  const r = await fetch(`${API}/sendVoice`, { method: 'POST', body: fd });
  const res = await r.json();
  if (!res.ok) console.error('[tg sendVoice]', res.description);
}

async function downloadTelegramFile(fileId) {
  const info = await tg('getFile', { file_id: fileId });
  if (!info.ok) throw new Error(`getFile: ${info.description}`);
  const path = info.result.file_path;
  const r = await fetch(`${FILE_API}/${path}`);
  return Buffer.from(await r.arrayBuffer());
}

// ─── OpenAI: Whisper (transcrição) + TTS ────────────────────────────────────
async function transcribe(oggBuffer) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY ausente — não dá pra transcrever áudio');
  const fd = new FormData();
  fd.append('file', new Blob([oggBuffer], { type: 'audio/ogg' }), 'audio.ogg');
  fd.append('model', 'whisper-1');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_KEY}` },
    body: fd,
  });
  const res = await r.json();
  if (!r.ok) throw new Error(`whisper: ${res.error?.message || r.status}`);
  return String(res.text || '').trim();
}

async function synthesize(text) {
  if (!OPENAI_KEY) return null;
  // opus em container ogg → formato nativo de voice message do Telegram
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: TTS_VOICE,
      input: text.slice(0, 4000), // teto de segurança do TTS
      response_format: 'opus',
    }),
  });
  if (!r.ok) {
    console.error('[tts]', (await r.text().catch(() => '')).slice(0, 200));
    return null;
  }
  return Buffer.from(await r.arrayBuffer());
}

// ─── Sessão: garante uma chat_sessions por chat do Telegram ─────────────────
async function ensureSession(chatId, seedTitle) {
  const existing = state[chatId]?.sessionId;
  if (existing) return existing;
  const { data, error } = await sb
    .from('chat_sessions')
    .insert({
      user_id: USER_ID,
      agent_id: AGENT_ID,
      title: `Telegram · ${seedTitle.slice(0, 40)}`,
    })
    .select('id')
    .single();
  if (error) throw new Error(`criar chat_sessions: ${error.message}`);
  state[chatId] = { sessionId: data.id, lastDeliveredAt: new Date().toISOString(), replyWithVoice: false };
  saveState();
  return data.id;
}

// ─── Inbound: recebe do Telegram, enfileira em collaborator_messages ────────
async function handleMessage(m) {
  const chatId = String(m.chat.id);

  // Allowlist (segurança). Vazia = bootstrap: revela o chat_id pra você preencher.
  if (ALLOWED.size === 0) {
    await sendText(
      chatId,
      `🔒 Bot em modo bootstrap.\nSeu chat_id é \`${chatId}\`.\n` +
        'Adicione em `TELEGRAM_ALLOWED_CHAT_IDS` no `~/.thribus/telegram-bridge.env` e reinicie.',
    );
    console.log(`[bootstrap] chat_id não autorizado: ${chatId}`);
    return;
  }
  if (!ALLOWED.has(chatId)) {
    console.log(`[ignorado] chat_id fora da allowlist: ${chatId}`);
    return;
  }

  let content = '';
  let wasVoice = false;

  const voice = m.voice || m.audio;
  if (voice) {
    wasVoice = true;
    await sendAction(chatId, 'typing');
    try {
      const buf = await downloadTelegramFile(voice.file_id);
      content = await transcribe(buf);
    } catch (e) {
      await sendText(chatId, `⚠️ Não consegui transcrever o áudio: ${e.message}`);
      return;
    }
    if (!content) {
      await sendText(chatId, '⚠️ Áudio veio vazio na transcrição.');
      return;
    }
  } else if (m.text) {
    content = m.text.trim();
  } else {
    await sendText(chatId, 'Por enquanto eu entendo texto e áudio. Manda assim. 🙂');
    return;
  }

  if (content === '/start') {
    await sendText(chatId, 'Opa, Charles. Bukowiski na linha pelo Telegram. Pode falar — texto ou áudio.');
    return;
  }

  const sessionId = await ensureSession(chatId, content);
  state[chatId].replyWithVoice = wasVoice; // a resposta espelha o canal de entrada
  saveState();

  const { error } = await sb.from('collaborator_messages').insert({
    agent_id: AGENT_ID,
    user_id: USER_ID,
    session_id: sessionId,
    role: 'user',
    content,
    status: 'pending',
    channel: 'telegram',
  });
  if (error) {
    await sendText(chatId, `⚠️ Falha ao enfileirar: ${error.message}`);
    return;
  }
  await sendAction(chatId, wasVoice ? 'record_voice' : 'typing');
  console.log(`[in] ${chatId} ${wasVoice ? '🎙️' : '💬'} "${content.slice(0, 60)}"`);
}

async function inboundLoop() {
  let offset = 0;
  for (;;) {
    try {
      const r = await fetch(`${API}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 25, allowed_updates: ['message'] }),
      });
      const res = await r.json();
      if (!res.ok) {
        console.error('[getUpdates]', res.description);
        await new Promise((x) => setTimeout(x, 3000));
        continue;
      }
      for (const u of res.result) {
        offset = u.update_id + 1;
        if (u.message) {
          try {
            await handleMessage(u.message);
          } catch (e) {
            console.error('[inbound]', e.message);
          }
        }
      }
    } catch (e) {
      console.error('[inbound loop]', e.message);
      await new Promise((x) => setTimeout(x, 3000));
    }
  }
}

// ─── Outbound: detecta respostas done e entrega no Telegram ─────────────────
async function deliverFor(chatId, entry) {
  const since = entry.lastDeliveredAt || new Date(0).toISOString();

  // erros da ponte (a user msg vira status='error') → avisa
  const { data: errs } = await sb
    .from('collaborator_messages')
    .select('error,created_at')
    .eq('session_id', entry.sessionId)
    .eq('status', 'error')
    .gt('created_at', since)
    .order('created_at', { ascending: true });
  for (const e of errs ?? []) {
    await sendText(chatId, `⚠️ Deu erro no processamento: ${e.error || 'desconhecido'}`);
    entry.lastDeliveredAt = e.created_at;
  }

  // respostas prontas
  const { data: replies } = await sb
    .from('collaborator_messages')
    .select('id,content,created_at')
    .eq('session_id', entry.sessionId)
    .eq('role', 'assistant')
    .eq('status', 'done')
    .gt('created_at', since)
    .order('created_at', { ascending: true });

  for (const rep of replies ?? []) {
    await sendText(chatId, rep.content);
    if (entry.replyWithVoice) {
      const ogg = await synthesize(rep.content);
      if (ogg) await sendVoice(chatId, ogg);
    }
    entry.lastDeliveredAt = rep.created_at;
    entry.replyWithVoice = false;
    console.log(`[out] ${chatId} → ${rep.content.length} chars`);
  }

  if ((errs?.length || 0) + (replies?.length || 0) > 0) saveState();

  // ainda processando? mantém o "digitando…"
  const { count } = await sb
    .from('collaborator_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', entry.sessionId)
    .eq('role', 'user')
    .in('status', ['pending', 'processing']);
  if (count && count > 0) await sendAction(chatId, entry.replyWithVoice ? 'record_voice' : 'typing');
}

async function outboundLoop() {
  for (;;) {
    for (const [chatId, entry] of Object.entries(state)) {
      try {
        await deliverFor(chatId, entry);
      } catch (e) {
        console.error('[outbound]', chatId, e.message);
      }
    }
    await new Promise((x) => setTimeout(x, OUTBOUND_POLL_MS));
  }
}

console.log(
  `Ponte Telegram no ar · agente=${AGENT_ID}\n` +
    `  allowlist: ${ALLOWED.size ? [...ALLOWED].join(', ') : '(vazia — modo bootstrap)'}\n` +
    `  voz: ${OPENAI_KEY ? `ativa (${TTS_VOICE})` : 'desativada (sem OPENAI_API_KEY)'}\n` +
    '  ⚠️  precisa da bukowiski-bridge.mjs rodando pra responder.',
);

Promise.all([inboundLoop(), outboundLoop()]).catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
