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
import { join, resolve } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Config "Cortex Brain" (vinda do painel /cortex-brain): modelo + esforço + teto
// por execução. O default vem do env (fallback); o painel sobrescreve via a
// tabela cortex_brain_config (scope='global'). Recarregada a cada ~15s no loop.
const DEFAULT_MODEL = process.env.BRIDGE_MODEL || 'opus'; // alias do CLI — resolve sozinho pro modelo atual
let BRAIN = { model: DEFAULT_MODEL, effort: 'high', maxBudgetUsd: 0, contextLimitTokens: 250000 };
// Modo voz: modelo leve/rápido (conversa falada), independente do Brain global.
const VOICE_MODEL = process.env.BRIDGE_VOICE_MODEL || 'sonnet';
const VOICE_EFFORT = process.env.BRIDGE_VOICE_EFFORT || 'low';
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
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS || 900_000); // chat: 15min (processos longos — o paralelismo por raia evita travar a fila)
const DEMAND_TIMEOUT_MS = Number(process.env.BRIDGE_DEMAND_TIMEOUT_MS || 1_500_000); // demandas: 25min (tarefas longas: relatórios, etc.)
// Unificação de cérebro (Caminho A): SÓ as conversas do Bukowiski rodam no cwd do
// daemon, pra compartilharem a sessão Claude (--resume) entre WhatsApp/Telegram/
// painel. Os outros 14 colaboradores seguem no cwd neutro do bridge (senão o
// CLAUDE.md do Bukowiski contaminaria a persona deles). Desligar: aponte
// BRIDGE_BUKOWISKI_CWD pro cwd do bridge.
const BUKOWISKI_AGENT = 'bukowiski-thribus';
const BUKOWISKI_CWD = process.env.BRIDGE_BUKOWISKI_CWD || '/Users/charlesandrade/projects/Bukowiski';
const HISTORY = 20; // últimas N msgs do thread como contexto
// Anti-bloat de contexto: a sessão do claude é resumida a cada turno e ACUMULA
// (dumps de tool, etc.). Quando passa de ~70% da janela (1M no Max), reiniciamos
// a sessão limpa (re-seed persona + histórico recente) em vez de resumir infinito.
const CONTEXT_WINDOW = Number(process.env.BRIDGE_CONTEXT_WINDOW || 1_000_000);
const CONTEXT_RESET_TOKENS = Math.round(CONTEXT_WINDOW * Number(process.env.BRIDGE_CONTEXT_RESET_PCT || 0.70));

if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ── Concorrência: semáforo global + raias por conversa (portado do daemon) ────
// Conversas/demandas DIFERENTES rodam EM PARALELO (até MAX_CONCURRENCY); a MESMA
// conversa fica serial na sua raia, pra não corromper a sessão Claude (--resume +
// claude_session_id). Antes a ponte era 100% serial — 1 msg longa travava o painel
// inteiro. Agora uma tarefa de 10min numa conversa não bloqueia as outras.
const MAX_CONCURRENCY = Number(process.env.BRIDGE_MAX_CONCURRENCY || 3);
let _slots = MAX_CONCURRENCY;
const _waiters = [];
function _acquire() {
  if (_slots > 0) { _slots--; return Promise.resolve(); }
  return new Promise((res) => _waiters.push(res));
}
function _release() {
  _slots++;
  const next = _waiters.shift();
  if (next) { _slots--; next(); }
}
const _laneTails = new Map();
function runOnLane(laneKey, fn) {
  const prev = _laneTails.get(laneKey) || Promise.resolve();
  const tail = prev.then(async () => {
    await _acquire();
    try { return await fn(); } finally { _release(); }
  });
  _laneTails.set(laneKey, tail);
  tail.catch(() => {}).finally(() => { if (_laneTails.get(laneKey) === tail) _laneTails.delete(laneKey); });
  return tail;
}
// Claim atômico: marca o item como em-processamento; só 1 poll ganha a corrida
// (evita processar a mesma msg/demanda 2x agora que os ticks não são mais serial).
async function claimRow(table, id, fromStatus, toStatus) {
  const { data } = await sb.from(table).update({ status: toStatus })
    .eq('id', id).eq('status', fromStatus).select('id');
  return !!(data && data.length);
}

// Lê a config do painel (modelo + esforço + teto). Cacheia 15s pra não consultar
// o banco a cada poll. Em erro, mantém o último valor conhecido.
async function loadBrainConfig() {
  if (Date.now() - brainLoadedAt < 15_000) return BRAIN;
  try {
    const { data } = await sb
      .from('cortex_brain_config')
      .select('model,effort,max_budget_usd,context_limit_tokens')
      .eq('scope', 'global')
      .maybeSingle();
    if (data) {
      BRAIN = {
        model: data.model || DEFAULT_MODEL,
        effort: data.effort || 'high',
        maxBudgetUsd: Number(data.max_budget_usd) || 0,
        contextLimitTokens: Number(data.context_limit_tokens) || BRAIN.contextLimitTokens || 250000,
      };
    }
    brainLoadedAt = Date.now();
  } catch (e) {
    console.error('[brain config]', e.message);
  }
  return BRAIN;
}

// Limites do plano (janela de 5h + semanal). O CLI não expõe os headers
// `anthropic-ratelimit-unified-*`, então fazemos uma chamada-sonda mínima (1
// token haiku, custo desprezível) a cada ~2min e gravamos a utilização/reset de
// cada janela em cortex_brain_limits — o painel mostra quanto resta no rodapé.
let limitsCheckedAt = 0;
const LIMITS_EVERY_MS = Number(process.env.BRIDGE_LIMITS_MS || 120_000);
async function fetchUsageLimits() {
  if (Date.now() - limitsCheckedAt < LIMITS_EVERY_MS) return;
  limitsCheckedAt = Date.now();
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) return; // sem token OAuth → não dá pra ler os limites do plano
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    await res.text().catch(() => {}); // drena o corpo (não precisamos dele)
    const h = res.headers;
    const num = (k) => { const v = h.get(k); return v == null || v === '' ? null : Number(v); };
    const iso = (k) => { const v = num(k); return v ? new Date(v * 1000).toISOString() : null; };
    const fiveH = num('anthropic-ratelimit-unified-5h-utilization');
    if (fiveH == null) return; // proxy não repassou os headers → não regrava
    await sb.from('cortex_brain_limits').upsert({
      id: 'global',
      five_h_utilization: fiveH,
      five_h_reset: iso('anthropic-ratelimit-unified-5h-reset'),
      five_h_status: h.get('anthropic-ratelimit-unified-5h-status'),
      seven_d_utilization: num('anthropic-ratelimit-unified-7d-utilization'),
      seven_d_reset: iso('anthropic-ratelimit-unified-7d-reset'),
      seven_d_status: h.get('anthropic-ratelimit-unified-7d-status'),
      overall_status: h.get('anthropic-ratelimit-unified-status'),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[limits]', e.message);
  }
}

// Pastas de trabalho permitidas (allowlist + lista do seletor do painel). A
// conversa escolhe uma; o cwd do claude vira essa pasta. Cache 30s.
let _wfPaths = new Set();
let _wfAt = 0;
async function loadWorkFolders() {
  if (Date.now() - _wfAt < 30_000) return _wfPaths;
  try {
    const { data } = await sb.from('cortex_work_folders').select('path').eq('active', true);
    if (data) _wfPaths = new Set(data.map((r) => r.path));
    _wfAt = Date.now();
  } catch (e) { console.error('[work folders]', e.message); }
  return _wfPaths;
}
// cwd da conversa: a pasta escolhida no painel (se estiver na allowlist), senão
// o default do colaborador (Bukowiski no cwd dele; os outros no cwd neutro).
async function cwdForSession(agentId, workingDir) {
  if (workingDir) {
    const allowed = await loadWorkFolders();
    if (allowed.has(workingDir)) return workingDir;
    console.error('[cwd] pasta fora da allowlist, ignorando:', workingDir);
  }
  return agentId === BUKOWISKI_AGENT ? BUKOWISKI_CWD : undefined;
}

// Navegador de pastas pro painel: o painel (web) não acessa o filesystem; aqui
// listamos os subdiretórios de um caminho e devolvemos. Guard: só dentro do home
// do daemon e /Volumes (não expõe o sistema inteiro). Poller rápido (700ms) pra
// navegar fluido.
const FS_ROOTS = [homedir(), '/Volumes'];
function fsAllowed(p) {
  const r = resolve(p);
  return FS_ROOTS.some((root) => r === root || r.startsWith(root + '/'));
}
let _fsBusy = false;
async function tickFsBrowse() {
  if (_fsBusy) return;
  _fsBusy = true;
  try {
    const { data: reqs } = await sb
      .from('fs_browse_requests')
      .select('id,path')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);
    for (const req of reqs || []) {
      let patch;
      try {
        const base = req.path && req.path.trim() ? resolve(req.path.trim()) : homedir();
        if (!fsAllowed(base)) throw new Error('pasta fora do permitido');
        const ents = readdirSync(base, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => ({ name: d.name, path: join(base, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        patch = { status: 'done', entries: { base, items: ents }, error: null, resolved_at: new Date().toISOString() };
      } catch (e) {
        patch = { status: 'error', entries: null, error: e.message, resolved_at: new Date().toISOString() };
      }
      await sb.from('fs_browse_requests').update(patch).eq('id', req.id);
    }
    // limpeza: descarta pedidos resolvidos há mais de 5min
    await sb.from('fs_browse_requests').delete().lt('resolved_at', new Date(Date.now() - 5 * 60_000).toISOString());
  } catch (e) {
    console.error('[fs browse]', e.message);
  } finally {
    _fsBusy = false;
  }
}

// Grava o custo/tokens reais de uma execução (best-effort; nunca derruba o loop).
async function recordUsage({ userId, agentId, kind, refId, sessionId, usage }) {
  if (!usage) return;
  try {
    await sb.from('cortex_usage').insert({
      user_id: userId ?? null,
      agent_id: agentId ?? null,
      kind,
      ref_id: refId ?? null,
      session_id: sessionId ?? null,
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
  'de forma visual — então prefira tabela a despejar números no meio do texto.\n\n' +
  'CONCISÃO: NÃO narre cada micro-passo do seu processo na resposta ("deixa eu ver", "achei", "vou testar", ' +
  '"key veio vazia") — isso vira um blocão cansativo. Faça o trabalho e entregue a CONCLUSÃO: o que descobriu/' +
  'fez e o próximo passo. Parágrafos curtos (uma ideia cada, separados por linha em branco), bullets quando ' +
  'forem itens/passos. Se o caminho técnico importar, resuma em 2–3 bullets no fim — não a transcrição inteira.\n\n' +
  'CARDS: quando listar ENTIDADES (faturas, clientes, demandas, sistemas, leads, OS) — itens com nome + ' +
  'status/valor — em vez de tabela, devolva um bloco ```cards com um array JSON: ' +
  '[{"title":"TexNet · Mensalidade","subtitle":"vence 25/06","value":"R$ 1.200","status":"a receber","accent":"green"}]. ' +
  'O painel renderiza como cards. status = texto curto; accent opcional = green|gold|blue|red|amber ' +
  '(se omitir, a cor sai do status). Use cards pra 2–8 itens; acima disso, tabela. ' +
  'Pra OPÇÕES/ESCOLHAS (o Charles vai escolher UMA — ex: canal, conta, plano), inclua "action" em cada ' +
  'card = a frase exata que o painel envia quando ele CLICAR no card (ex: ' +
  '{"title":"WhatsApp ...8912-1001","status":"Opção A","action":"Pode usar o canal ...8912-1001 (opção A)"}). ' +
  'Com "action" o card fica clicável e o Charles escolhe num toque, sem digitar.\n\n' +
  'GRÁFICO: quando os números pedirem leitura visual (evolução no tempo, composição, comparação) devolva ' +
  'um bloco ```chart JSON: {"type":"bar|line|donut","title":"Faturamento por mês","unit":"R$","data":' +
  '[{"label":"Jan","value":12000},{"label":"Fev","value":15000}]}. bar = comparar categorias, line = ' +
  'evolução no tempo, donut = composição (partes do todo). unit opcional (R$, %). Use 2–12 pontos; pode vir ' +
  'junto de uma tabela (gráfico pra ver, tabela pro detalhe).\n\n' +
  'CONFIRMAR: antes de QUALQUER ação que mexa em dinheiro, produção/deploy, DNS, exclusão de dados ou envio ' +
  'a externos — NÃO execute direto. Descreva e peça confirmação com um bloco ```confirm JSON: ' +
  '{"action":"Criar cobrança PIX de R$ 1.200 pro TexNet","detail":"vencimento 25/06","danger":false}. ' +
  'O painel mostra botões Confirmar/Cancelar; só execute quando o Charles confirmar na mensagem seguinte. ' +
  'Use danger:true pra ações destrutivas (deletar, derrubar serviço).\n\n' +
  'ARTEFATO: pra entregas LONGAS e estruturadas (relatório, dossiê, plano de ação, análise extensa, ' +
  'documento) — em vez de despejar tudo no chat, devolva um bloco ```artifact JSON: ' +
  '{"title":"Relatório de recall — Dra Aloma","type":"relatório","content":"<markdown completo do documento>"}. ' +
  'O painel mostra um cartão clicável que abre o conteúdo num painel lateral (canvas). Use pra textos longos/' +
  'documentos; resposta curta vai direto no chat normal. Pode acompanhar de 1 frase de contexto antes do bloco. ' +
  'Quando for RELATÓRIO, estruture no PADRÃO THRIBUS (título, resumo executivo, seções, conclusão + próximos ' +
  'passos) — use a skill thribus-report-standard como referência. Se o Charles pedir pra PUBLICAR NO HUB ' +
  '(há um botão "Publicar no Hub" no painel do artefato), gere o HTML branded com thribus-report-standard e ' +
  'publique com a skill thribus-hub-publish, devolvendo o LINK de compartilhamento — confirme antes (```confirm), ' +
  'é entrega externa.\n\n' +
  '(NÃO use cards/confirm/artifact em modo voz — ali a resposta é só fala natural.)\n\n' +
  'EFICIÊNCIA DE CONTEXTO (importante): a sessão é mantida entre turnos e TUDO que você lê fica na memória e ' +
  'pesa nos próximos turnos. Ao consultar banco/IXC/arquivos: NUNCA traga tabela inteira nem dump gigante pro ' +
  'contexto. Use queries com LIMIT e filtros, SELECT só das colunas necessárias, e prefira AGREGAR/CONTAR a ' +
  'listar tudo (ex: "SELECT count(*)" em vez de listar 500 linhas). Se um resultado for grande, leia o ' +
  'suficiente pra responder e RESUMA — não cole o bruto completo. Isso mantém a sessão leve e rápida.';

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

function buildPrompt(agent, history, content, seed = null) {
  let ctx = '';
  if (seed) {
    // Sessão compactada: o modelo NÃO tem o histórico completo — o resumo curado
    // é a memória dele. (caminho C — ver migration 20260624_chat_compaction)
    ctx =
      `Resumo do contexto desta conversa até aqui (ela foi COMPACTADA — você não tem ` +
      `o histórico completo; use este resumo como sua memória):\n${seed}\n\n`;
  } else {
    const transcript = history
      .map((m) => `${m.role === 'user' ? 'Charles' : agent.name}: ${m.content}`)
      .join('\n');
    ctx = transcript ? `Histórico recente da conversa:\n${transcript}\n\n` : '';
  }
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
      '--include-partial-messages', // deltas de texto → streaming ao vivo no painel
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
    // Marca esta invocação pro cc-mirror PULAR — senão o hook criaria uma conversa
    // "💻 <projeto>" gêmea da conversa do painel (mesmo claude_session_id). Ver
    // ~/.claude/hooks/lib/cc-mirror.mjs (guard CC_MIRROR_SKIP).
    env.CC_MIRROR_SKIP = '1';
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env, cwd: opts.cwd || undefined });
    if (opts.onSpawn) { try { opts.onSpawn(child); } catch { /* noop */ } }
    let buf = '';
    let err = '';
    let result = null;
    let streamedText = ''; // texto acumulado dos deltas (streaming ao vivo)
    let pendingBreak = false; // houve tool entre rajadas de texto → quebra de parágrafo
    // Uso da ÚLTIMA mensagem do assistant — reflete a janela de contexto real do
    // último turno (input+cache da chamada final), ao contrário do uso do evento
    // 'result', que SOMA todos os round-trips de tool calls e infla o número.
    let lastAssistantUsage = null;
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
      // Delta de texto (--include-partial-messages) → acumula e emite pro painel.
      if (evt.type === 'stream_event' && evt.event?.type === 'content_block_delta' && evt.event.delta?.type === 'text_delta') {
        // Nova rajada de texto após uma tool → começa em parágrafo novo. Sem isso a
        // narração de processo cola tudo num blocão ("...primeiro.Não tem skill...").
        if (pendingBreak && streamedText && !streamedText.endsWith('\n')) streamedText += '\n\n';
        pendingBreak = false;
        streamedText += evt.event.delta.text || '';
        if (opts.onText) { try { opts.onText(streamedText); } catch { /* nunca derruba o parse */ } }
        return;
      }
      if (evt.type === 'assistant' && evt.message) {
        if (evt.message.usage) lastAssistantUsage = evt.message.usage;
      }
      if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
        for (const b of evt.message.content) {
          if (b && b.type === 'tool_use') {
            pendingBreak = true; // próxima rajada de texto começa em parágrafo novo
            if (opts.onEvent) {
              try { opts.onEvent({ kind: 'tool', toolUseId: b.id, label: b.name || 'tool', detail: summarizeToolInput(b.input), input: fullInput(b.input) }); }
              catch { /* nunca derruba o parse */ }
            }
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
        else {
          const lu = lastAssistantUsage;
          const contextTokens = lu
            ? (lu.input_tokens || 0) + (lu.cache_creation_input_tokens || 0) + (lu.cache_read_input_tokens || 0) + (lu.output_tokens || 0)
            : null;
          resolve({ text: result.text || streamedText, usage: result.usage, sessionId: result.sessionId, contextTokens });
        }
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
    .select('claude_session_id,context_tokens,working_dir,context_seed')
    .eq('id', msg.session_id)
    .maybeSingle();
  let resumeId = sess?.claude_session_id || null;
  // Anti-bloat: se o contexto acumulado passou do teto (cortex_brain_config — o
  // Charles controla em /cortex-brain, 250k a 1M), NÃO resume — reinicia a sessão
  // limpa (re-seed persona + histórico recente) e zera o acúmulo.
  const ctxLimit = BRAIN.contextLimitTokens || CONTEXT_RESET_TOKENS;
  if (resumeId && (sess?.context_tokens || 0) > ctxLimit) {
    console.log(`[contexto ${sess.context_tokens} > teto ${ctxLimit} → reinicia sessão limpa]`);
    resumeId = null;
  }

  // anexos (imagem/PDF/vídeo) → baixa pro Mac e referencia no prompt
  const files = await downloadAttachments(msg.attachments);
  // Modo voz: o usuário está FALANDO e a resposta será LIDA em voz alta (TTS).
  // Avisa o agente pra responder pra ser ouvido — e NUNCA dizer que "não fala".
  const voiceNote = msg.is_voice
    ? '\n\n[MODO VOZ — o usuário está falando com você e ESTA resposta será convertida em fala (TTS, voz OpenAI). Responda naturalmente pra ser OUVIDO: frases curtas, pontuação clara, PT-BR, sem markdown/código/listas. Você TEM voz — NUNCA diga que não pode falar/ler em voz alta; só responda normalmente que o sistema fala por você. Seja conciso.]'
    : '';
  const content = msg.content + attachNote(files) + voiceNote;

  let evSeq = 0;
  const onEvent = (e) => {
    if (e.kind === 'tool_result') { recordRunEventResult(msg.id, e.toolUseId, e.result); return; }
    recordRunEvent({ userId: msg.user_id, scope: 'chat', refId: msg.id, seq: evSeq++, label: e.label, detail: e.detail, input: e.input, toolUseId: e.toolUseId });
  };
  // Modo voz → modelo leve/rápido (conversa falada). A execução normal (texto/
  // painel/demandas) segue no modelo forte do cortex_brain_config global.
  const voice = msg.is_voice ? { model: VOICE_MODEL, effort: VOICE_EFFORT } : {};
  const cwd = await cwdForSession(msg.agent_id, sess?.working_dir);
  const opts = { model: BRAIN.model, effort: BRAIN.effort, ...voice, maxBudgetUsd: BRAIN.maxBudgetUsd, onEvent, cwd };

  // ── Streaming ──────────────────────────────────────────────────────────────
  // A msg do assistente NASCE no 1º token de texto e o conteúdo cresce em chunks
  // (throttle ~400ms). Antes do texto, o indicador "pensando/executando" segue
  // (a msg só existe quando o texto começa). Modo voz não faz streaming (curto +
  // falado). Tudo best-effort: o write final (done) é o autoritativo.
  let asstId = null;
  let lastFlush = 0;
  let finalized = false;
  async function writeStream(text, done) {
    if (finalized && !done) return;
    if (done) finalized = true;
    if (!asstId) {
      const { data } = await sb.from('collaborator_messages')
        .insert({ session_id: msg.session_id, agent_id: msg.agent_id, user_id: msg.user_id, role: 'assistant', content: text, status: done ? 'done' : 'processing', channel: msg.channel })
        .select('id').single();
      asstId = data?.id ?? null;
    } else {
      await sb.from('collaborator_messages').update(done ? { content: text, status: 'done' } : { content: text }).eq('id', asstId);
    }
  }
  if (!msg.is_voice) {
    opts.onText = (text) => {
      const now = Date.now();
      if (now - lastFlush < 400) return;
      lastFlush = now;
      writeStream(text, false).catch(() => { /* chunk best-effort */ });
    };
  }

  // Botão "Parar" do chat: o front marca a msg como 'cancelled'. Um poller detecta
  // e MATA o claude; aí não escrevemos resposta e a msg fica como 'cancelled'.
  const ctl = { child: null, cancelled: false };
  opts.onSpawn = (c) => { ctl.child = c; };
  const pollCancel = setInterval(async () => {
    try {
      const { data } = await sb.from('collaborator_messages').select('status').eq('id', msg.id).maybeSingle();
      if (data?.status === 'cancelled') { ctl.cancelled = true; try { ctl.child?.kill('SIGKILL'); } catch { /* noop */ } }
    } catch { /* noop */ }
  }, 1500);

  try {
    let r = null;
    if (resumeId) {
      // retoma a sessão: manda SÓ a mensagem nova (persona/histórico já estão lá)
      try {
        r = await runClaude(content, { ...opts, resumeSessionId: resumeId });
      } catch (e) {
        if (ctl.cancelled) throw e;
        console.error(`[resume falhou, recomeçando sessão] ${e.message}`);
        r = null;
      }
    }
    if (!r) {
      if (ctl.cancelled) throw new Error('cancelado');
      // inicia (ou reinicia) a sessão semeando o contexto. Se a conversa foi
      // COMPACTADA (caminho C), semeia com o resumo curado; senão, com o
      // histórico RECENTE cru (comportamento padrão).
      let recent = [];
      if (!sess?.context_seed) {
        const { data: history } = await sb
          .from('collaborator_messages')
          .select('role,content,created_at')
          .eq('session_id', msg.session_id)
          .in('status', ['done'])
          .order('created_at', { ascending: false })
          .limit(HISTORY);
        recent = (history ?? []).reverse(); // mais recentes, em ordem cronológica
      }
      r = await runClaude(buildPrompt(agent, recent, content, sess?.context_seed || null), opts);
    }
    if (ctl.cancelled) throw new Error('cancelado');

    const reply = r.text;
    if (!reply && !asstId) throw new Error('resposta vazia do claude');

    // Finaliza: insere (se nunca streamou) ou consolida o conteúdo com o texto
    // autoritativo do 'result' + status done (aí o painel mostra as ações).
    await writeStream(reply || '', true);
    await sb.from('collaborator_messages').update({ status: 'done' }).eq('id', msg.id);

    // grava a sessão do claude + a janela de contexto (pro painel mostrar X/1M).
    // Usa o uso da última mensagem do assistant (janela real do turno); só cai no
    // uso cumulativo do 'result' se a última mensagem não trouxe usage.
    if (msg.session_id && r.sessionId) {
      const ctx = r.contextTokens ?? (r.usage ? r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.outputTokens : null);
      const patch = { claude_session_id: r.sessionId };
      if (ctx != null) patch.context_tokens = ctx;
      await sb.from('chat_sessions').update(patch).eq('id', msg.session_id);
    }

    await recordUsage({ userId: msg.user_id, agentId: msg.agent_id, kind: 'chat', refId: msg.id, sessionId: msg.session_id, usage: r.usage });
    console.log(
      `[ok] ${agent.name} respondeu (${reply.length} chars` +
        `${r.usage ? `, $${r.usage.costUsd.toFixed(4)}` : ''}${resumeId ? ' · resume' : ' · novo'})`,
    );
  } catch (e) {
    // Streaming parcial já gravado → finaliza como 'done' (mantém o que foi dito)
    // pra não deixar mensagem pela metade em 'processing'.
    if (asstId && !finalized) { try { await sb.from('collaborator_messages').update({ status: 'done' }).eq('id', asstId); } catch { /* noop */ } }
    if (ctl.cancelled) { console.log(`[parado] msg ${msg.id} cancelada pelo usuário`); return; }
    throw e;
  } finally {
    clearInterval(pollCancel);
  }
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
    // Claim atômico + dispara na raia da conversa: conversas diferentes em paralelo,
    // a mesma conversa serial. O loop NÃO espera aqui (não-bloqueante).
    if (!(await claimRow('collaborator_messages', msg.id, 'pending', 'processing'))) continue;
    runOnLane(`chat:${msg.session_id || msg.id}`, () => processMessage(msg)).catch(async (e) => {
      console.error(`[erro] msg ${msg.id}:`, e.message);
      await sb
        .from('collaborator_messages')
        .update({ status: 'error', error: String(e.message).slice(0, 500) })
        .eq('id', msg.id);
    });
  }
}

// ─── Compactação de conversa (caminho C) ────────────────────────────────────
// Gera um resumo curado (TL;DR) usando a PRÓPRIA sessão do claude (--resume, que
// já tem o contexto todo), grava como semente + marcador visual e ZERA a sessão.
// A próxima mensagem reinicia a sessão semeada com o resumo — contexto barato,
// histórico visual intacto. Roda na raia da conversa (não colide com mensagens).
const COMPACT_PROMPT =
  'Compacte NOSSA conversa num resumo de contexto que outra instância sua use pra ' +
  'continuar SEM o histórico completo. PT-BR, denso mas LEGÍVEL e escaneável. ' +
  'Siga EXATAMENTE este formato (markdown), nesta ordem:\n\n' +
  '**Onde paramos:** uma frase — o estado atual e o que trava ou qual o próximo movimento.\n\n' +
  '## Decisões\n- decisões firmes já tomadas (e o que foi descartado, se importa).\n\n' +
  '## Feito\n- o que já foi executado/entregue — com paths/commits quando relevante.\n\n' +
  '## Pendências\n- o que falta e o que está bloqueado, por quê.\n\n' +
  '## Próximo passo\n- a(s) ação(ões) imediata(s), em ordem (1–3 itens).\n\n' +
  '## Fatos & IDs\n- identificadores que não dá pra perder: paths, URLs, nomes, números, IDs.\n\n' +
  'Regras de formato: bullets curtos (1 linha cada quando der); **negrito SÓ** no que é ' +
  'decisão ou bloqueio crítico — NÃO em tudo; `code` para paths/comandos/IDs. Sem título ' +
  'no topo (o painel já rotula), sem saudação, sem "neste resumo", sem repetir. Direto.';

const clearCompactFlag = (id) => sb.from('chat_sessions').update({ compact_requested: false }).eq('id', id);

async function compactSession(sess, agent) {
  // Espelho do Claude Code (source='claude_code'): o --resume falha (sessão vive em
  // outro cwd), mas o FALLBACK por histórico resume mesmo assim. Por isso o MANUAL
  // funciona aqui também; só o AUTO (teto) é restrito a 'panel' (ver tickCompaction).
  const isMirror = sess.source === 'claude_code';
  const cwd = await cwdForSession(sess.agent_id, sess.working_dir);
  let summary = '';
  let usage = null;
  // 1ª tentativa: --resume (barato — o modelo já tem o contexto na sessão).
  if (sess.claude_session_id) {
    try {
      const r = await runClaude(COMPACT_PROMPT, {
        resumeSessionId: sess.claude_session_id,
        model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd, cwd,
      });
      summary = (r.text || '').trim();
      usage = r.usage;
    } catch (e) {
      console.error(`[compact resume falhou] sessão ${sess.id}: ${e.message} → fallback histórico`);
    }
  }
  // Fallback: sessão expirada / --resume falhou → resume a partir do histórico cru
  // (sessão nova, sem --resume). Funciona pra qualquer conversa.
  if (!summary) {
    const { data: hist } = await sb
      .from('collaborator_messages')
      .select('role,content')
      .eq('session_id', sess.id)
      .in('status', ['done'])
      .order('created_at', { ascending: true })
      .limit(200);
    const transcript = (hist ?? [])
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? 'Charles' : agent.name}: ${m.content}`)
      .join('\n');
    if (transcript.trim()) {
      try {
        const r = await runClaude(`${COMPACT_PROMPT}\n\nConversa a resumir:\n${transcript}`, {
          model: BRAIN.model, effort: BRAIN.effort, maxBudgetUsd: BRAIN.maxBudgetUsd, cwd,
        });
        summary = (r.text || '').trim();
        usage = r.usage;
      } catch (e) {
        console.error(`[compact fallback falhou] sessão ${sess.id}: ${e.message}`);
      }
    }
  }
  if (!summary) {
    // Nada deu certo: baixa a flag (não fica em loop) e deixa o reset cego agir no teto.
    await clearCompactFlag(sess.id);
    return;
  }
  // Marcador visual (role='system') + semente, e zera o ponteiro de contexto.
  const { data: marker } = await sb.from('collaborator_messages')
    .insert({ session_id: sess.id, agent_id: sess.agent_id, user_id: sess.user_id, role: 'system', content: summary, status: 'done', channel: 'thribus' })
    .select('id').single();
  const patch = {
    context_seed: summary,
    context_tokens: 0,
    compacted_at: new Date().toISOString(),
    compact_requested: false,
  };
  // Conversa digitada: zera o ponteiro → próxima msg reinicia a sessão semeada com o
  // resumo. Espelho: NÃO mexe no claude_session_id — senão o cc-mirror perde o vínculo
  // e recria uma gêmea na próxima atividade no Claude Code desktop. O reseed via
  // context_seed acontece igual (o --resume da sessão do CC falha → cai no resumo).
  if (!isMirror) patch.claude_session_id = null;
  await sb.from('chat_sessions').update(patch).eq('id', sess.id);
  await recordUsage({ userId: sess.user_id, agentId: sess.agent_id, kind: 'chat', refId: marker?.id, sessionId: sess.id, usage });
  console.log(`[compactado] ${agent.name} · sessão ${sess.id} → resumo ${summary.length} chars`);
}

// Sessões com compactação EM ANDAMENTO — a compactação leva ~10-30s (chamada ao
// claude), mas o poll roda a cada 3s; sem isto, re-enfileirava a MESMA sessão a
// cada poll (flag ainda não baixou) e inseria vários marcadores idênticos.
const _compacting = new Set();
async function tickCompaction(teamIds) {
  // Manual (botão "Compactar" → compact_requested) OU automático (contexto passou
  // do teto do painel). Em ambos, gera resumo curado em vez do corte cego.
  const ctxLimit = BRAIN.contextLimitTokens || CONTEXT_RESET_TOKENS;
  // MANUAL (botão → compact_requested) funciona pra qualquer conversa, inclusive
  // espelho. AUTO (passou do teto) só nas DIGITADAS (source='panel') — não dispara
  // sozinho nas sessões do Claude Code (que o Charles controla no próprio CC).
  const { data: rows, error } = await sb
    .from('chat_sessions')
    .select('id,agent_id,user_id,claude_session_id,working_dir,context_tokens,compact_requested,source')
    .or(`compact_requested.eq.true,and(context_tokens.gt.${ctxLimit},source.eq.panel)`)
    .limit(3);
  if (error) { console.error('[compact poll erro]', error.message); return; }
  for (const sess of rows ?? []) {
    if (!teamIds.has(sess.agent_id)) continue;
    if (_compacting.has(sess.id)) continue; // já em andamento → não re-enfileira
    _compacting.add(sess.id);
    const { data: agent } = await sb.from('agents').select('id,name,sector,system_prompt').eq('id', sess.agent_id).single();
    if (!agent) { _compacting.delete(sess.id); continue; }
    // Mesma raia das mensagens da conversa → serial (não corrompe a sessão).
    runOnLane(`chat:${sess.id}`, () => compactSession(sess, agent))
      .catch((e) => console.error(`[compact erro] sessão ${sess.id}:`, e.message))
      .finally(() => _compacting.delete(sess.id));
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
    // Claim atômico + raia da demanda — não bloqueia o loop (senão uma demanda
    // longa de 25min travaria o re-poll do chat).
    if (!(await claimRow('team_demands', d.id, 'todo', 'doing'))) continue;
    runOnLane(`demand:${d.id}`, () => processDemand(d)).catch(async (e) => {
      console.error(`[erro] demanda ${d.id}:`, e.message);
      await sb
        .from('team_demands')
        .update({ status: 'error', error: String(e.message).slice(0, 500) })
        .eq('id', d.id);
    });
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
    // Claim atômico + raia da demanda (mesma raia da demanda-mãe — não roda a
    // demanda e sua resposta em paralelo, pois compartilham contexto).
    if (!(await claimRow('demand_messages', m.id, 'pending', 'processing'))) continue;
    runOnLane(`demand:${m.demand_id}`, () => processDemandReply(m)).catch(async (e) => {
      console.error(`[erro] thread ${m.id}:`, e.message);
      await sb.from('demand_messages').update({ status: 'error', error: String(e.message).slice(0, 500) }).eq('id', m.id);
      await sb.from('team_demands').update({ status: 'done' }).eq('id', m.demand_id); // não deixa travada em 'doing'
    });
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
    await fetchUsageLimits();       // limites do plano (5h + semana) → painel (cache 2min)
    await importSkills();           // espelha as skills reais no painel (1x)
    await materializeSkills();      // skills do painel → ~/.claude/skills (cache 15s)
    await tick(teamIds);            // chat interativo primeiro
    await tickCompaction(teamIds);  // compacta conversas (botão ou teto) → semente
    await tickDemandReplies(teamIds); // respostas no thread (conversa ativa) têm prioridade
    await tickRoutines(teamIds);    // rotinas vencidas viram demanda
    await tickDemands(teamIds);     // depois 1 demanda nova da fila
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
// Navegador de pastas: poller próprio e rápido (independe do loop pesado) pra
// navegar fluido no seletor "Abrir pasta…" do painel.
setInterval(tickFsBrowse, 700);
loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
