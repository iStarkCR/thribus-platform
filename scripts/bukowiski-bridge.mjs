#!/usr/bin/env node
/**
 * Ponte Painel Thribus → Claude Code (Bukowiski & colaboradores).
 *
 * Roda no SEU Mac (onde vivem o `claude` CLI, a skill /bukowiski e o ~/.claude).
 * Faz o loop:
 *   1. lê collaborator_messages com status='pending' (mensagens que você mandou no painel)
 *   2. marca 'processing'
 *   3. roda `claude -p` como o colaborador (Bukowiski usa o command /bukowiski;
 *      os demais usam o system_prompt do agente no banco) + histórico do thread
 *   4. grava a resposta (role='assistant', 'done') e marca sua msg 'done'
 *   5. em erro: marca 'error' + guarda o motivo
 *
 * Setup (1x):
 *   ~/.thribus/bukowiski-bridge.env  (NÃO versionar):
 *     export SUPABASE_URL="https://tidthojvieogbvdtlwvj.supabase.co"
 *     export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # backend-only (bypassa RLS p/ gravar resposta)
 *     # opcionais:
 *     export BRIDGE_MODEL="claude-opus-4-7"
 *     export BRIDGE_POLL_MS="3000"
 *     export BRIDGE_TIMEOUT_MS="180000"
 *     # A ponte atende SÓ o time interno (acesso total). Clientes vão pela API.
 *     # Marcador do time (default já correto):
 *     #   export BRIDGE_TEAM_CLIENT="Thribus Tech (Interno)"
 *
 * Uso:
 *   source ~/.thribus/bukowiski-bridge.env && node scripts/bukowiski-bridge.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Config "Cortex Brain" (vinda do painel /cortex-brain): modelo + esforço + teto
// por execução. O default vem do env (fallback); o painel sobrescreve via a
// tabela cortex_brain_config (scope='global'). Recarregada a cada ~15s no loop.
const DEFAULT_MODEL = process.env.BRIDGE_MODEL || 'opus'; // alias do CLI — resolve sozinho pro modelo atual
let BRAIN = { model: DEFAULT_MODEL, effort: 'high', maxBudgetUsd: 0 };
let brainLoadedAt = 0;
// --effort só vale pra opus/fable (o CLI ignora em sonnet/haiku). Cobre tanto o
// alias ('opus') quanto IDs fixos ('claude-opus-4-7').
const effortApplies = (m) => /opus|fable/.test(m);
// O CLI só conhece 5 níveis; o painel tem 6 (o topo "ultra"/Ultracode) → vira max.
const cliEffort = (e) => (e === 'ultra' ? 'max' : e);
// A ponte atende SÓ o time interno da Thribus (esses rodam pelo CLI do Mac, com
// acesso total). Agentes de cliente são respondidos pela API (worker) — a ponte
// os ignora pra que um cliente nunca execute nada na sua máquina.
const TEAM_CLIENT = process.env.BRIDGE_TEAM_CLIENT || 'Thribus Tech (Interno)';
const POLL_MS = Number(process.env.BRIDGE_POLL_MS || 3000);
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS || 180_000); // chat interativo: 3min
const DEMAND_TIMEOUT_MS = Number(process.env.BRIDGE_DEMAND_TIMEOUT_MS || 1_500_000); // demandas: 25min (tarefas longas: relatórios, etc.)
const HISTORY = 20; // últimas N msgs do thread como contexto

if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// Lê a config do painel (modelo + esforço + teto). Cacheia 15s pra não consultar
// o banco a cada poll. Em erro, mantém o último valor conhecido.
async function loadBrainConfig() {
  if (Date.now() - brainLoadedAt < 15_000) return BRAIN;
  try {
    const { data } = await sb
      .from('cortex_brain_config')
      .select('model,effort,max_budget_usd')
      .eq('scope', 'global')
      .maybeSingle();
    if (data) {
      BRAIN = {
        model: data.model || DEFAULT_MODEL,
        effort: data.effort || 'high',
        maxBudgetUsd: Number(data.max_budget_usd) || 0,
      };
    }
    brainLoadedAt = Date.now();
  } catch (e) {
    console.error('[brain config]', e.message);
  }
  return BRAIN;
}

// Grava o custo/tokens reais de uma execução (best-effort; nunca derruba o loop).
async function recordUsage({ userId, agentId, kind, refId, usage }) {
  if (!usage) return;
  try {
    await sb.from('cortex_usage').insert({
      user_id: userId ?? null,
      agent_id: agentId ?? null,
      kind,
      ref_id: refId ?? null,
      model: usage.model || BRAIN.model,
      effort: effortApplies(BRAIN.model) ? BRAIN.effort : null,
      cost_usd: usage.costUsd,
      total_tokens: usage.totalTokens,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      duration_ms: usage.durationMs,
      num_turns: usage.numTurns,
    });
  } catch (e) {
    console.error('[usage] falha ao gravar:', e.message);
  }
}

// Grava um passo ("o que ele está fazendo") pro painel mostrar ao vivo + o
// input completo (pra abrir e ver o processo).
async function recordRunEvent({ userId, scope, refId, seq, label, detail, input, toolUseId }) {
  try {
    await sb.from('run_events').insert({
      user_id: userId ?? null, scope, ref_id: refId, seq,
      kind: 'tool', label: label || null, detail: detail || null,
      input: input || null, tool_use_id: toolUseId || null,
    });
  } catch { /* best-effort: nunca atrapalha a execução */ }
}

// Anexa o resultado (saída) de um tool ao passo correspondente (pelo tool_use_id).
async function recordRunEventResult(refId, toolUseId, result) {
  if (!toolUseId || !result) return;
  try {
    await sb.from('run_events').update({ result: String(result).slice(0, 4000) })
      .eq('ref_id', refId).eq('tool_use_id', toolUseId);
  } catch { /* best-effort */ }
}

// Anexos do chat: baixa do bucket pro Mac e devolve os caminhos locais pro agente.
const ATTACH_DIR = join(homedir(), '.thribus/bridge/attachments');
async function downloadAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  try { mkdirSync(ATTACH_DIR, { recursive: true }); } catch { /* ok */ }
  const out = [];
  for (const a of attachments) {
    try {
      const { data, error } = await sb.storage.from('chat-attachments').download(a.path);
      if (error || !data) { console.error('[anexo] falha:', a.path, error?.message); continue; }
      const buf = Buffer.from(await data.arrayBuffer());
      const safe = String(a.name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-80);
      const local = join(ATTACH_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
      writeFileSync(local, buf);
      out.push({ local, mime: a.mime || '', name: a.name || safe });
    } catch (e) { console.error('[anexo] erro:', e.message); }
  }
  return out;
}
function attachNote(files) {
  if (!files.length) return '';
  const lines = files.map((f) => {
    const kind = /^image\//.test(f.mime) ? 'imagem'
      : /^video\//.test(f.mime) ? 'vídeo'
      : f.mime.includes('pdf') ? 'PDF' : 'arquivo';
    return `- ${f.local}  (${kind}: ${f.name})`;
  }).join('\n');
  return `\n\n[O Charles ANEXOU ${files.length} arquivo(s) nesta mensagem (caminhos locais no Mac). ` +
    `LEIA-OS pra responder — não chute: use a tool Read pra imagens, PDFs e textos; pra vídeo, use a skill ` +
    `de análise de vídeo (ou Higgsfield). Arquivos:\n${lines}\n]`;
}

const BUKOWISKI_ID = 'bukowiski-thribus';
// Time interno: acesso total às skills, segue os próprios gates da persona.
const GUARD =
  'Você responde via chat assíncrono do painel Thribus. Você TEM acesso total às suas skills e pode ' +
  'executar ações. Siga os gates da sua própria persona (confirme com o Charles antes de gastar dinheiro, ' +
  'mexer em produção/deploy, alterar DNS, deletar dados ou enviar a externos). Ao final, devolva ao Charles ' +
  'o texto da resposta: o que foi feito e o que precisa da decisão dele.\n\n' +
  'FORMATAÇÃO: responda em markdown. SEMPRE que devolver dados, números, métricas, listas de itens ou ' +
  'comparações, use TABELAS markdown (| Coluna | Coluna |\\n| --- | --- |\\n| valor | valor |). Use listas ' +
  'pra passos, **negrito** pra destaques e ## títulos pra seções. O painel renderiza tabelas e markdown ' +
  'de forma visual — então prefira tabela a despejar números no meio do texto.';

let bukowiskiCmd = null;
function bukowiskiPersona() {
  if (bukowiskiCmd === null) {
    try {
      const raw = readFileSync(join(homedir(), '.claude/commands/bukowiski.md'), 'utf8');
      bukowiskiCmd = raw.replace(/^---[\s\S]*?---\s*/, ''); // tira frontmatter
    } catch {
      bukowiskiCmd = 'Você é o Bukowiski, COO (AI) da Thribus Tech. Direto, PT-BR, executa e reporta.\n\n$ARGUMENTS';
    }
  }
  return bukowiskiCmd;
}

function buildPrompt(agent, history, content) {
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'Charles' : agent.name}: ${m.content}`)
    .join('\n');
  const ctx = transcript ? `Histórico recente da conversa:\n${transcript}\n\n` : '';
  const task = `${ctx}Nova mensagem do Charles:\n${content}`;

  if (agent.id === BUKOWISKI_ID) {
    return bukowiskiPersona().replace('$ARGUMENTS', task);
  }
  const persona = agent.system_prompt
    ? `Você é ${agent.name}, ${agent.sector} da Thribus Tech.\n${agent.system_prompt}`
    : `Você é ${agent.name}, ${agent.sector} da Thribus Tech.`;
  return `${persona}\n\n${task}`;
}

// Resumo curto do input de um tool, pra mostrar "o que ele está fazendo".
function summarizeToolInput(input) {
  if (!input || typeof input !== 'object') return '';
  const f =
    input.command || input.file_path || input.path || input.pattern ||
    input.url || input.query || input.description || input.prompt ||
    input.skill || input.title || '';
  return String(f).replace(/\s+/g, ' ').slice(0, 160);
}

// Input COMPLETO (pra abrir o passo e ver o processo).
function fullInput(input) {
  if (input == null) return '';
  if (typeof input !== 'object') return String(input);
  if (typeof input.command === 'string') return input.command; // Bash legível
  try { return JSON.stringify(input, null, 2).slice(0, 4000); } catch { return ''; }
}

// Saída de um tool_result (string ou blocos de texto).
function extractResult(content) {
  if (typeof content === 'string') return content.slice(0, 4000);
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n').slice(0, 4000);
  }
  return '';
}

// Converte o evento 'result' (stream-json) em { text, usage, isError }.
function parseResultEvent(evt) {
  const u = evt.usage || {};
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const outTok = u.output_tokens || 0;
  return {
    isError: !!evt.is_error,
    text: String(evt.result || '').trim(),
    sessionId: evt.session_id || null,
    usage: {
      costUsd: Number(evt.total_cost_usd) || 0,
      inputTokens: inTok,
      outputTokens: outTok,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      totalTokens: inTok + outTok,
      durationMs: evt.duration_ms || 0,
      numTurns: evt.num_turns || 0,
      model: evt.model || null,
    },
  };
}

// Roda o claude em stream-json: emite cada tool call via opts.onEvent (pro painel
// mostrar "o que ele está fazendo") e devolve { text, usage } do evento 'result'.
// opts: { timeoutMs, model, effort, maxBudgetUsd, onEvent }.
function runClaude(prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  const model = opts.model || BRAIN.model;
  return new Promise((resolve, reject) => {
    // time interno → acesso total; gates ficam por conta da persona do agente
    const args = [
      '-p', prompt,
      '--append-system-prompt', GUARD,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--permission-mode', 'bypassPermissions',
    ];
    if (opts.effort && effortApplies(model)) args.push('--effort', cliEffort(opts.effort));
    if (opts.maxBudgetUsd && Number(opts.maxBudgetUsd) > 0) {
      args.push('--max-budget-usd', String(opts.maxBudgetUsd));
    }
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId); // memória otimizada
    // Remove envs de sessão herdadas (se a ponte for iniciada de dentro de um
    // Claude Code) que apontariam pro proxy errado. PRESERVA o CLAUDE_CODE_OAUTH_TOKEN
    // (token de `claude setup-token`) — é assim que o daemon autentica headless,
    // já que o login do Keychain não é acessível em segundo plano.
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k === 'CLAUDE_CODE_OAUTH_TOKEN') continue; // mantém o token do daemon
      if (
        k === 'ANTHROPIC_BASE_URL' ||
        k === 'ANTHROPIC_API_KEY' ||
        k === 'ANTHROPIC_AUTH_TOKEN' ||
        k.startsWith('CLAUDE_CODE_') ||
        k.startsWith('CLAUDE_AGENT_SDK')
      ) {
        delete env[k];
      }
    }
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let buf = '';
    let err = '';
    let result = null;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout ${timeoutMs}ms`));
    }, timeoutMs);

    // cada linha do stdout é um evento NDJSON do stream-json
    const handleLine = (line) => {
      const s = line.trim();
      if (!s) return;
      let evt;
      try { evt = JSON.parse(s); } catch { return; }
      if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
        for (const b of evt.message.content) {
          if (b && b.type === 'tool_use' && opts.onEvent) {
            try { opts.onEvent({ kind: 'tool', toolUseId: b.id, label: b.name || 'tool', detail: summarizeToolInput(b.input), input: fullInput(b.input) }); }
            catch { /* nunca derruba o parse */ }
          }
        }
      } else if (evt.type === 'user' && evt.message && Array.isArray(evt.message.content)) {
        for (const b of evt.message.content) {
          if (b && b.type === 'tool_result' && opts.onEvent) {
            try { opts.onEvent({ kind: 'tool_result', toolUseId: b.tool_use_id, result: extractResult(b.content) }); }
            catch { /* nunca derruba o parse */ }
          }
        }
      } else if (evt.type === 'result') {
        result = parseResultEvent(evt);
      }
    };

    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim()) handleLine(buf); // última linha sem \n final
      if (result) {
        if (result.isError) reject(new Error(result.text || 'claude retornou erro'));
        else resolve({ text: result.text, usage: result.usage, sessionId: result.sessionId });
        return;
      }
      if (code !== 0) reject(new Error(`claude saiu com código ${code}: ${err.slice(0, 400)}`));
      else reject(new Error('sem evento de resultado do claude'));
    });
  });
}

async function processMessage(msg) {
  await sb.from('collaborator_messages').update({ status: 'processing' }).eq('id', msg.id);

  const { data: agent } = await sb
    .from('agents')
    .select('id,name,sector,system_prompt')
    .eq('id', msg.agent_id)
    .single();
  if (!agent) throw new Error(`agente ${msg.agent_id} não encontrado`);

  // Sessão do claude desta conversa (memória otimizada via --resume).
  const { data: sess } = await sb
    .from('chat_sessions')
    .select('claude_session_id')
    .eq('id', msg.session_id)
    .maybeSingle();
  const resumeId = sess?.claude_session_id || null;

  // anexos (imagem/PDF/vídeo) → baixa pro Mac e referencia no prompt
  const files = await downloadAttachments(msg.attachments);
  const content = msg.content + attachNote(files);

  let evSeq = 0;
  const onEvent = (e) => {
    if (e.kind === 'tool_result') { recordRunEventResult(msg.id, e.toolUseId, e.result); return; }
    recordRunEvent({ userId: msg.user_id, scope: 'chat', refId: msg.id, seq: evSeq++, label: e.label, detail: e.detail, input: e.input, toolUseId: e.toolUseId });
  };
  const opts = { model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd, onEvent };

  let r = null;
  if (resumeId) {
    // retoma a sessão: manda SÓ a mensagem nova (persona/histórico já estão lá)
    try {
      r = await runClaude(content, { ...opts, resumeSessionId: resumeId });
    } catch (e) {
      console.error(`[resume falhou, recomeçando sessão] ${e.message}`);
      r = null;
    }
  }
  if (!r) {
    // inicia (ou reinicia) a sessão: persona + histórico RECENTE pra semear o contexto
    const { data: history } = await sb
      .from('collaborator_messages')
      .select('role,content,created_at')
      .eq('session_id', msg.session_id)
      .in('status', ['done'])
      .order('created_at', { ascending: false })
      .limit(HISTORY);
    const recent = (history ?? []).reverse(); // mais recentes, em ordem cronológica
    r = await runClaude(buildPrompt(agent, recent, content), opts);
  }

  const reply = r.text;
  if (!reply) throw new Error('resposta vazia do claude');

  await sb.from('collaborator_messages').insert({
    session_id: msg.session_id,
    agent_id: msg.agent_id,
    user_id: msg.user_id,
    role: 'assistant',
    content: reply,
    status: 'done',
    channel: msg.channel,
  });
  await sb.from('collaborator_messages').update({ status: 'done' }).eq('id', msg.id);

  // grava a sessão do claude + a janela de contexto (pro painel mostrar X/1M)
  if (msg.session_id && r.sessionId) {
    const ctx = r.usage ? (r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.outputTokens) : null;
    const patch = { claude_session_id: r.sessionId };
    if (ctx != null) patch.context_tokens = ctx;
    await sb.from('chat_sessions').update(patch).eq('id', msg.session_id);
  }

  await recordUsage({ userId: msg.user_id, agentId: msg.agent_id, kind: 'chat', refId: msg.id, usage: r.usage });
  console.log(
    `[ok] ${agent.name} respondeu (${reply.length} chars` +
      `${r.usage ? `, $${r.usage.costUsd.toFixed(4)}` : ''}${resumeId ? ' · resume' : ' · novo'})`,
  );
}

async function loadTeamIds() {
  const { data, error } = await sb.from('agents').select('id').eq('client', TEAM_CLIENT);
  if (error) throw new Error(`loadTeamIds: ${error.message}`);
  return new Set((data ?? []).map((a) => a.id));
}

async function tick(teamIds) {
  const { data: pending, error } = await sb
    .from('collaborator_messages')
    .select('*')
    .eq('status', 'pending')
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(5);
  if (error) {
    console.error('[poll erro]', error.message);
    return;
  }
  for (const msg of pending ?? []) {
    // Agente de cliente → respondido pela API (worker), não pela ponte do Mac.
    if (!teamIds.has(msg.agent_id)) continue;
    try {
      await processMessage(msg);
    } catch (e) {
      console.error(`[erro] msg ${msg.id}:`, e.message);
      await sb
        .from('collaborator_messages')
        .update({ status: 'error', error: String(e.message).slice(0, 500) })
        .eq('id', msg.id);
    }
  }
}

// ─── Fila de demandas (Kanban "Demandas do time") ───────────────────────────
// O Charles adiciona demandas no painel; aqui o agente EXECUTA a tarefa.
async function processDemand(d) {
  await sb.from('team_demands').update({ status: 'doing' }).eq('id', d.id);

  const { data: agent } = await sb
    .from('agents')
    .select('id,name,sector,system_prompt')
    .eq('id', d.agent_id)
    .single();
  if (!agent) throw new Error(`agente ${d.agent_id} não encontrado`);

  // Demanda-filho (resposta do Charles a uma demanda anterior): puxa o contexto
  // do pai (título + o que o agente entregou/perguntou) pra continuar coerente.
  let parentCtx = '';
  if (d.parent_id) {
    const { data: parent } = await sb
      .from('team_demands')
      .select('title,result')
      .eq('id', d.parent_id)
      .maybeSingle();
    if (parent) {
      parentCtx =
        `\n\nCONTEXTO — esta é a resposta/decisão do Charles a uma demanda anterior sua.\n` +
        `Demanda anterior: ${parent.title}\n` +
        (parent.result ? `O que você entregou/perguntou antes:\n${parent.result}\n` : '') +
        `Agora o Charles respondeu abaixo. Execute o que ele decidiu, usando esse contexto.`;
    }
  }

  const detailLabel = d.parent_id ? 'Resposta/decisão do Charles' : 'Contexto/detalhes';
  const task =
    `DEMANDA do Charles${d.project ? ` (projeto ${d.project})` : ''}: ${d.title}` +
    parentCtx +
    (d.description ? `\n\n${detailLabel}:\n${d.description}` : '') +
    `\n\nExecute a demanda de ponta a ponta. No final, devolva um resumo curto do que foi feito ` +
    `e, se algo precisa da decisão do Charles (gastar dinheiro, mexer em produção, etc.), diga claramente o que falta.`;

  let evSeq = 0;
  const onEvent = (e) => {
    if (e.kind === 'tool_result') { recordRunEventResult(d.id, e.toolUseId, e.result); return; }
    recordRunEvent({ userId: d.user_id, scope: 'demand', refId: d.id, seq: evSeq++, label: e.label, detail: e.detail, input: e.input, toolUseId: e.toolUseId });
  };
  const r = await runClaude(buildPrompt(agent, [], task), {
    timeoutMs: DEMAND_TIMEOUT_MS,
    model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd, onEvent,
  });
  const result = r.text;
  if (!result) throw new Error('resposta vazia do claude');

  // limpa o erro antigo se a demanda foi reenfileirada depois de falhar
  await sb.from('team_demands').update({ status: 'done', result, error: null }).eq('id', d.id);
  await recordUsage({ userId: d.user_id, agentId: d.agent_id, kind: 'demand', refId: d.id, usage: r.usage });
  console.log(
    `[ok] ${agent.name} executou demanda "${d.title.slice(0, 50)}" (${result.length} chars` +
      `${r.usage ? `, $${r.usage.costUsd.toFixed(4)}` : ''})`,
  );
}

async function tickDemands(teamIds) {
  const { data: queue, error } = await sb
    .from('team_demands')
    .select('*')
    .eq('status', 'todo')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1); // 1 por vez pra não travar o chat interativo
  if (error) {
    console.error('[demandas poll erro]', error.message);
    return;
  }
  for (const d of queue ?? []) {
    if (!teamIds.has(d.agent_id)) continue; // só o time interno executa pela ponte
    try {
      await processDemand(d);
    } catch (e) {
      console.error(`[erro] demanda ${d.id}:`, e.message);
      await sb
        .from('team_demands')
        .update({ status: 'error', error: String(e.message).slice(0, 500) })
        .eq('id', d.id);
    }
  }
}

// ─── Respostas no thread da demanda (conversa dentro do MESMO card) ─────────
// O Charles responde dentro da demanda (demand_messages 'pending'); aqui o
// agente continua a tarefa com o fio inteiro de contexto, sem criar card novo.
async function processDemandReply(m) {
  const { data: d } = await sb.from('team_demands').select('*').eq('id', m.demand_id).single();
  if (!d) throw new Error(`demanda ${m.demand_id} não encontrada`);

  const { data: agent } = await sb
    .from('agents')
    .select('id,name,sector,system_prompt')
    .eq('id', d.agent_id)
    .single();
  if (!agent) throw new Error(`agente ${d.agent_id} não encontrado`);

  await sb.from('team_demands').update({ status: 'doing' }).eq('id', d.id);

  // fio: turnos anteriores já concluídos (a 'pending' atual fica de fora)
  const { data: prior } = await sb
    .from('demand_messages')
    .select('role,content,created_at')
    .eq('demand_id', d.id)
    .eq('status', 'done')
    .order('created_at', { ascending: true });

  let thread = `DEMANDA (conversa em andamento com o Charles)${d.project ? ` · projeto ${d.project}` : ''}: ${d.title}`;
  if (d.description) thread += `\n\nTarefa original:\n${d.description}`;
  if (d.result) thread += `\n\nVocê já entregou/respondeu antes:\n${d.result}`;
  for (const msg of prior ?? []) {
    thread += `\n\n${msg.role === 'user' ? 'Charles' : 'Você'}: ${msg.content}`;
  }
  thread += `\n\nCharles agora responde:\n${m.content}`;
  thread +=
    `\n\nContinue a tarefa a partir dessa resposta. Execute de ponta a ponta e devolva um resumo ` +
    `curto do que foi feito; se precisar de mais alguma decisão do Charles, diga claramente o que falta.`;

  let evSeq = 0;
  const onEvent = (e) => {
    if (e.kind === 'tool_result') { recordRunEventResult(d.id, e.toolUseId, e.result); return; }
    recordRunEvent({ userId: d.user_id, scope: 'demand', refId: d.id, seq: evSeq++, label: e.label, detail: e.detail, input: e.input, toolUseId: e.toolUseId });
  };
  const r = await runClaude(buildPrompt(agent, [], thread), {
    timeoutMs: DEMAND_TIMEOUT_MS,
    model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd, onEvent,
  });
  const result = r.text;
  if (!result) throw new Error('resposta vazia do claude');

  await sb.from('demand_messages').insert({
    demand_id: d.id, user_id: d.user_id, role: 'assistant',
    content: result, status: 'done', cost_usd: r.usage?.costUsd ?? 0,
  });
  await sb.from('demand_messages').update({ status: 'done' }).eq('id', m.id);
  await sb.from('team_demands').update({ status: 'done', error: null }).eq('id', d.id);
  await recordUsage({ userId: d.user_id, agentId: d.agent_id, kind: 'demand', refId: d.id, usage: r.usage });
  console.log(
    `[ok] ${agent.name} respondeu no thread "${d.title.slice(0, 40)}" (${result.length} chars` +
      `${r.usage ? `, $${r.usage.costUsd.toFixed(4)}` : ''})`,
  );
}

async function tickDemandReplies(teamIds) {
  const { data: pend, error } = await sb
    .from('demand_messages')
    .select('id,demand_id,content')
    .eq('status', 'pending')
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.error('[thread poll erro]', error.message);
    return;
  }
  for (const m of pend ?? []) {
    // só processa se a demanda é de um agente do time interno
    const { data: d } = await sb.from('team_demands').select('agent_id').eq('id', m.demand_id).single();
    if (!d || !teamIds.has(d.agent_id)) continue;
    try {
      await processDemandReply(m);
    } catch (e) {
      console.error(`[erro] thread ${m.id}:`, e.message);
      await sb.from('demand_messages').update({ status: 'error', error: String(e.message).slice(0, 500) }).eq('id', m.id);
      await sb.from('team_demands').update({ status: 'done' }).eq('id', m.demand_id); // não deixa travada em 'doing'
    }
  }
}

// ─── Rotinas (demandas recorrentes) ─────────────────────────────────────────
function computeNextRun(kind, runTime, weekday) {
  const [h, m] = String(runTime || '09:00').split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h || 0, m || 0, 0, 0);
  if (kind === 'weekly') {
    const wd = (((Number(weekday) || 0) % 7) + 7) % 7;
    let add = (wd - next.getDay() + 7) % 7;
    if (add === 0 && next <= now) add = 7;
    next.setDate(next.getDate() + add);
  } else if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

async function tickRoutines(teamIds) {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await sb
    .from('team_routines')
    .select('*')
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(5);
  if (error) { console.error('[rotinas poll erro]', error.message); return; }
  for (const rt of due ?? []) {
    if (!teamIds.has(rt.agent_id)) continue;
    try {
      await sb.from('team_demands').insert({
        user_id: rt.user_id, agent_id: rt.agent_id,
        title: rt.title, description: rt.description, project: rt.project,
        status: 'todo', priority: 3,
      });
      const next = computeNextRun(rt.schedule_kind, rt.run_time, rt.weekday);
      await sb.from('team_routines').update({ last_run_at: nowIso, next_run_at: next }).eq('id', rt.id);
      console.log(`[rotina] criou demanda "${String(rt.title).slice(0, 40)}" · próximo ${next}`);
    } catch (e) {
      console.error(`[rotina erro] ${rt.id}:`, e.message);
    }
  }
}

// ─── Skills (cadastradas pelo painel ↔ ~/.claude/skills) ────────────────────
const SKILLS_DIR = join(homedir(), '.claude/skills');
const SKILLS_MANIFEST = join(homedir(), '.thribus/bridge/managed-skills.json');
let skillsImported = false;
let skillsSyncedAt = 0;

function readManifest() {
  try { return JSON.parse(readFileSync(SKILLS_MANIFEST, 'utf8')); } catch { return []; }
}
function writeManifest(list) {
  try { mkdirSync(join(homedir(), '.thribus/bridge'), { recursive: true }); writeFileSync(SKILLS_MANIFEST, JSON.stringify(list, null, 2)); } catch { /* ok */ }
}
function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { name: '', description: '', body: md.trim() };
  const fm = m[1];
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
  return { name: get('name'), description: get('description'), body: (m[2] || '').trim() };
}
function buildSkillMd(s) {
  const desc = String(s.description || '').replace(/\s*\n\s*/g, ' ').trim();
  return `---\nname: ${s.slug}\ndescription: ${desc}\n---\n\n${s.body || ''}\n`;
}

// Importa as skills REAIS pro painel (espelho managed=false) — 1x no boot.
async function importSkills() {
  if (skillsImported) return;
  skillsImported = true;
  let dirs = [];
  try { dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return; }
  let n = 0;
  for (const slug of dirs) {
    const file = join(SKILLS_DIR, slug, 'SKILL.md');
    if (!existsSync(file)) continue;
    try {
      const { name, description, body } = parseFrontmatter(readFileSync(file, 'utf8'));
      const { data: ex } = await sb.from('cortex_skills').select('managed').eq('slug', slug).maybeSingle();
      if (ex?.managed) continue; // não sobrescreve uma skill do painel
      await sb.from('cortex_skills').upsert(
        { slug, name: name || slug, description: description || null, body, managed: false, enabled: true, user_id: null },
        { onConflict: 'slug' },
      );
      n++;
    } catch (e) { console.error('[skill import]', slug, e.message); }
  }
  console.log(`[skills] ${n} skills reais espelhadas no painel`);
}

// Materializa as skills do painel (managed+enabled) em ~/.claude/skills e remove
// (SÓ do manifesto — nunca toca nas reais) as desligadas/apagadas.
async function materializeSkills() {
  if (Date.now() - skillsSyncedAt < 15_000) return;
  skillsSyncedAt = Date.now();
  const { data, error } = await sb.from('cortex_skills').select('slug,description,body,enabled').eq('managed', true);
  if (error) return;
  const manifest = readManifest();
  const desired = (data || []).filter((s) => s.enabled);
  const desiredSlugs = new Set(desired.map((s) => s.slug));
  for (const s of desired) {
    try {
      const dir = join(SKILLS_DIR, s.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), buildSkillMd(s));
    } catch (e) { console.error('[skill write]', s.slug, e.message); }
  }
  for (const slug of manifest) {
    if (desiredSlugs.has(slug)) continue;
    try { const dir = join(SKILLS_DIR, slug); if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
  const next = [...desiredSlugs].sort();
  if (JSON.stringify(next) !== JSON.stringify([...manifest].sort())) writeManifest(next);
}

console.log(
  `Ponte Bukowiski no ar · model=${BRAIN.model} (config do painel) · poll=${POLL_MS}ms\n` +
    `  atende: time interno (client="${TEAM_CLIENT}") com acesso total\n` +
    '  chat + demandas (Kanban) + respostas no thread · uso em cortex_usage\n' +
    '  agentes de cliente: ignorados',
);
async function loop() {
  for (;;) {
    const teamIds = await loadTeamIds();
    await loadBrainConfig();        // modelo/esforço/teto vindos do painel (cache 15s)
    await importSkills();           // espelha as skills reais no painel (1x)
    await materializeSkills();      // skills do painel → ~/.claude/skills (cache 15s)
    await tick(teamIds);            // chat interativo primeiro
    await tickDemandReplies(teamIds); // respostas no thread (conversa ativa) têm prioridade
    await tickRoutines(teamIds);    // rotinas vencidas viram demanda
    await tickDemands(teamIds);     // depois 1 demanda nova da fila
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
