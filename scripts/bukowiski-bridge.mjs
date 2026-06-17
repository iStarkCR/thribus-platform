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
// Config "Cortex Brain" (vinda do painel /cortex-brain): modelo + esforço + teto
// por execução. O default vem do env (fallback); o painel sobrescreve via a
// tabela cortex_brain_config (scope='global'). Recarregada a cada ~15s no loop.
const DEFAULT_MODEL = process.env.BRIDGE_MODEL || 'opus'; // alias do CLI — resolve sozinho pro modelo atual
let BRAIN = { model: DEFAULT_MODEL, effort: 'high', maxBudgetUsd: 0 };
let brainLoadedAt = 0;
// --effort só vale pra opus/fable (o CLI ignora em sonnet/haiku).
const effortApplies = (m) => m === 'opus' || m === 'fable';
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

// Extrai texto + uso (custo/tokens) do JSON do `claude --output-format json`.
function parseClaudeJson(out) {
  const raw = out.trim();
  let obj = null;
  try { obj = JSON.parse(raw); } catch { obj = null; }
  if (obj && obj.type === 'result') {
    if (obj.is_error) {
      throw new Error(String(obj.result || obj.subtype || 'claude retornou erro').slice(0, 400));
    }
    const u = obj.usage || {};
    const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const outTok = u.output_tokens || 0;
    return {
      text: String(obj.result || '').trim(),
      usage: {
        costUsd: Number(obj.total_cost_usd) || 0,
        inputTokens: inTok,
        outputTokens: outTok,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        totalTokens: inTok + outTok,
        durationMs: obj.duration_ms || 0,
        numTurns: obj.num_turns || 0,
        model: obj.model || null,
      },
    };
  }
  return { text: raw, usage: null }; // fallback: trata como texto puro
}

// Roda o claude com o modelo/esforço/teto vindos da config do painel.
// Retorna { text, usage }. opts: { timeoutMs, model, effort, maxBudgetUsd }.
function runClaude(prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  const model = opts.model || BRAIN.model;
  return new Promise((resolve, reject) => {
    // time interno → acesso total; gates ficam por conta da persona do agente
    const args = [
      '-p', prompt,
      '--append-system-prompt', GUARD,
      '--output-format', 'json',
      '--model', model,
      '--permission-mode', 'bypassPermissions',
    ];
    if (opts.effort && effortApplies(model)) args.push('--effort', opts.effort);
    if (opts.maxBudgetUsd && Number(opts.maxBudgetUsd) > 0) {
      args.push('--max-budget-usd', String(opts.maxBudgetUsd));
    }
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
      reject(new Error(`timeout ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude saiu com código ${code}: ${err.slice(0, 400)}`));
        return;
      }
      try { resolve(parseClaudeJson(out)); }
      catch (e) { reject(e); }
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

  const r = await runClaude(buildPrompt(agent, history ?? [], msg.content), {
    model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd,
  });
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
  await recordUsage({ userId: msg.user_id, agentId: msg.agent_id, kind: 'chat', refId: msg.id, usage: r.usage });
  console.log(
    `[ok] ${agent.name} respondeu (${reply.length} chars` +
      `${r.usage ? `, $${r.usage.costUsd.toFixed(4)}` : ''})`,
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

  const r = await runClaude(buildPrompt(agent, [], task), {
    timeoutMs: DEMAND_TIMEOUT_MS,
    model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd,
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

console.log(
  `Ponte Bukowiski no ar · model=${BRAIN.model} (config do painel) · poll=${POLL_MS}ms\n` +
    `  atende: time interno (client="${TEAM_CLIENT}") com acesso total\n` +
    '  chat + fila de demandas (Kanban) · uso real gravado em cortex_usage\n' +
    '  agentes de cliente: ignorados',
);
async function loop() {
  for (;;) {
    const teamIds = await loadTeamIds();
    await loadBrainConfig();    // modelo/esforço/teto vindos do painel (cache 15s)
    await tick(teamIds);        // chat interativo primeiro
    await tickDemands(teamIds); // depois 1 demanda da fila
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
