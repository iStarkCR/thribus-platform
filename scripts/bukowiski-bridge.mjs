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
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL = process.env.BRIDGE_MODEL || 'opus'; // alias do CLI (igual o daemon do WhatsApp) — resolve sozinho pro Opus atual
// A ponte atende SÓ o time interno da Thribus (esses rodam pelo CLI do Mac, com
// acesso total). Agentes de cliente são respondidos pela API (worker) — a ponte
// os ignora pra que um cliente nunca execute nada na sua máquina.
const TEAM_CLIENT = process.env.BRIDGE_TEAM_CLIENT || 'Thribus Tech (Interno)';
const POLL_MS = Number(process.env.BRIDGE_POLL_MS || 3000);
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS || 180_000);
const HISTORY = 20; // últimas N msgs do thread como contexto

if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const BUKOWISKI_ID = 'bukowiski-thribus';
// Time interno: acesso total às skills, segue os próprios gates da persona.
const GUARD =
  'Você responde via chat assíncrono do painel Thribus. Você TEM acesso total às suas skills e pode ' +
  'executar ações. Siga os gates da sua própria persona (confirme com o Charles antes de gastar dinheiro, ' +
  'mexer em produção/deploy, alterar DNS, deletar dados ou enviar a externos). Ao final, devolva ao Charles ' +
  'o texto da resposta: o que foi feito e o que precisa da decisão dele.';

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

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    // time interno → acesso total; gates ficam por conta da persona do agente
    const args = [
      '-p', prompt,
      '--append-system-prompt', GUARD,
      '--output-format', 'text',
      '--model', MODEL,
      '--permission-mode', 'bypassPermissions',
    ];
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
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude saiu com código ${code}: ${err.slice(0, 400)}`));
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

  // Histórico da MESMA sessão (contexto da conversa).
  const { data: history } = await sb
    .from('collaborator_messages')
    .select('role,content,created_at')
    .eq('session_id', msg.session_id)
    .in('status', ['done'])
    .order('created_at', { ascending: true })
    .limit(HISTORY);

  const reply = await runClaude(buildPrompt(agent, history ?? [], msg.content));
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
  console.log(`[ok] ${agent.name} respondeu (${reply.length} chars)`);
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

  const task =
    `DEMANDA do Charles${d.project ? ` (projeto ${d.project})` : ''}: ${d.title}` +
    (d.description ? `\n\nContexto/detalhes:\n${d.description}` : '') +
    `\n\nExecute a demanda de ponta a ponta. No final, devolva um resumo curto do que foi feito ` +
    `e, se algo precisa da decisão do Charles (gastar dinheiro, mexer em produção, etc.), diga claramente o que falta.`;

  const result = await runClaude(buildPrompt(agent, [], task));
  if (!result) throw new Error('resposta vazia do claude');

  await sb.from('team_demands').update({ status: 'done', result }).eq('id', d.id);
  console.log(`[ok] ${agent.name} executou demanda "${d.title.slice(0, 50)}" (${result.length} chars)`);
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

console.log(
  `Ponte Bukowiski no ar · model=${MODEL} · poll=${POLL_MS}ms\n` +
    `  atende: time interno (client="${TEAM_CLIENT}") com acesso total\n` +
    '  chat + fila de demandas (Kanban) · agentes de cliente: ignorados',
);
async function loop() {
  for (;;) {
    const teamIds = await loadTeamIds();
    await tick(teamIds);        // chat interativo primeiro
    await tickDemands(teamIds); // depois 1 demanda da fila
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
