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
const MODEL = process.env.BRIDGE_MODEL || 'claude-opus-4-7';
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
    // Usa o login real do ~/.claude: remove envs de sessão herdadas (ex: se a
    // ponte for iniciada de dentro de um Claude Code) que apontariam pro proxy errado.
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
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

  const { data: history } = await sb
    .from('collaborator_messages')
    .select('role,content,created_at')
    .eq('user_id', msg.user_id)
    .eq('agent_id', msg.agent_id)
    .in('status', ['done'])
    .order('created_at', { ascending: true })
    .limit(HISTORY);

  const reply = await runClaude(buildPrompt(agent, history ?? [], msg.content));
  if (!reply) throw new Error('resposta vazia do claude');

  await sb.from('collaborator_messages').insert({
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

async function tick() {
  const teamIds = await loadTeamIds();
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

console.log(
  `Ponte Bukowiski no ar · model=${MODEL} · poll=${POLL_MS}ms\n` +
    `  atende: time interno (client="${TEAM_CLIENT}") com acesso total\n` +
    '  agentes de cliente: ignorados (respondidos pela API/worker)',
);
async function loop() {
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
