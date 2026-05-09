/**
 * Agent loop — TexNet CRM
 *
 * Fluxo por turno:
 *   1. Ativa botMode no lead (se ainda não estiver)
 *   2. Busca histórico do lead (GET /leads/:id)
 *   3. Monta mensagens para Claude (histórico + msg atual)
 *   4. Chama Claude com tools disponíveis
 *   5. tool_use → executa → volta para 4  (até MAX_TOOL_ITERATIONS)
 *   6. text → envia via POST /leads/:id/messages → fim
 *
 * Caso especial:
 *   - Claude chamar tool "escalar_humano" → desativa bot + atribui agente humano
 *   - botMode == false no momento do processamento → humano assumiu → cancela
 */

import type { MessageParam } from '../llm/client.js';
import { callLLM, type ToolDefinition } from '../llm/client.js';
import { executeTool } from '../tools/dispatcher.js';
import * as crm from '../crm/dispatcher.js';
import { db } from '../db/index.js';
import type { WorkspaceRecord } from '../db/index.js';
import type { AgentJob } from '../queue/index.js';
import { extractImageRefs, urlToAnthropicImageBlock } from '../media/vision.js';
import { generateSpeech } from '../media/tts.js';
import * as talki from '../talki/client.js';
import * as texnet from '../crm/client.js';
import {
  buildStateReminder,
  extractStateData,
  isTerminalState,
  nextStateAfterTool,
  SALES_FLOW_STATES,
} from './state-machine.js';
import { buildHandoffSummary } from './handoff-summary.js';
import { getToolInputSchema } from './tool-schemas.js';
import { routeMessage } from './router.js';
import { enrichWithSkills } from './skill-loader.js';

const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS ?? 10);

/** Parse seguro: devolve o objeto se for JSON válido; senão devolve a string crua. */
function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// Anti-promise: detecta "vou X / um momento" — agente prometendo ação sem executar
const PROMISE_PATTERNS = [
  /\bvou\s+(verificar|consultar|buscar|listar|realizar|fazer|chamar|acessar|pesquisar|conferir|cadastrar|criar|processar|enviar|abrir|gerar|providenciar|preparar|montar)\b/i,
  /\bum\s+momento\b/i,
  /\baguarde\b/i,
  /\b(estou|vou\s+estar|ja\s+estou|já\s+estou)\s+(verificando|consultando|buscando|processando|listando|realizando|cadastrando|preparando|gerando|montando)\b/i,
  // Gerúndio no início de linha (ex: "Verificando cobertura...")
  /^\s*(verificando|consultando|buscando|processando|listando|realizando|cadastrando|preparando|gerando|montando|analisando|validando|conferindo)\s+\w+/im,
  /\bj[aá]\s+(te\s+)?retorno\b/i,
  /\b(s[oó]\s+um\s+(instante|segundo|minuto|momento|momentinho))\b/i,
];

function looksLikePromise(text: string): boolean {
  return PROMISE_PATTERNS.some((p) => p.test(text));
}

// Auto-escalation: detecta quando o agente está encaminhando pra humano.
// Quando detectado, o worker automaticamente:
//   1. Envia a mensagem ao cliente (resposta normal)
//   2. Chama crm.escalateToHuman() — botMode=false + stage=aguardando + responsibleId=null
//   3. Marca state=escalated → triggers cleanup do histórico
//
// Safety net: o caminho preferencial é o LLM chamar a tool `escalar_humano`.
// Estes patterns existem pra cobrir o caso "fala mas não age" — quando o LLM
// anuncia o handoff em texto sem chamar a tool. Cobertura precisa ser ampla:
// o prompt sugere frases como "vou te conectar com nosso time" / "alguém vai
// falar com você", e variantes com "te"/"lhe" como objeto direto eram
// invisíveis pros patterns antigos (que esperavam apenas "você"/"vc").
export const ESCALATION_PATTERNS = [
  // (1) Verbo de handoff (passar/conectar/direcionar/encaminhar/transferir),
  //     com pronome objeto opcional (você/vc/te/lhe), preposição (para/pra/pro/com),
  //     e destino (time/equipe/atendente/consultor/comercial/responsável/setor).
  //     Cobre: "vou passar você para o time", "deixa eu te passar para o time
  //     comercial", "vou te conectar com nosso time", "encaminhar pra equipe",
  //     "transferir pra um atendente".
  /\b(passar|conectar|direcionar|encaminhar|transferir)(\s+(voc[eê]|vc|te|lhe))?\s+(com\s+|a\s+)?(para|pra|pro)\s+(o\s+|um\s+|uma\s+|nosso\s+|nossa\s+)?(time|equipe|atendente|consultor|comercial|respons[áa]vel|setor)/i,

  // (2) "vou te/lhe + verbo de handoff" — captura o caso clássico pt-BR
  //     "vou te conectar com nosso time agora" mesmo se o destino já matched
  //     no padrão (1). Defensivo contra variantes truncadas.
  /\bvou\s+(te|lhe)\s+(passar|conectar|direcionar|encaminhar|transferir)\b/i,

  // (3) "alguém (do nosso time) vai (falar|atender|conversar)" — variante
  //     com sujeito "alguém". O original exigia "do nosso time"; agora é opcional.
  /\balgu[eé]m\s+(do\s+(nosso\s+)?time\s+)?vai\s+(falar|te\s+atender|atend|conversar|entrar\s+em\s+contato)/i,

  // (4) "equipe/time vai te (atender|chamar|atender|responder)"
  /\b(equipe|time)\s+vai\s+(te|lhe)?\s*(atender|chamar|responder|entrar\s+em\s+contato)/i,

  // (5) "equipe será notificada" — original
  /\bequipe\s+ser[áa]\s+notificad/i,
];

export function looksLikeEscalation(text: string): boolean {
  return ESCALATION_PATTERNS.some((p) => p.test(text));
}

// Cliente pede humano explicitamente — frases que o cliente diz pedindo
// pra falar com pessoa de verdade. Se detectado, escala imediatamente.
const CUSTOMER_WANTS_HUMAN_PATTERNS = [
  /\b(quero|preciso|posso)\s+falar\s+com\s+(uma\s+|um\s+)?(pessoa|atendente|humano|algu[eé]m|gente|operador|consultor)/i,
  /\bpassa\s+(pra|para)\s+(uma\s+|um\s+)?(pessoa|atendente|humano|algu[eé]m|gente|operador|consultor)/i,
  /\b(falar|conversar)\s+com\s+(uma\s+pessoa|algu[eé]m\s+(real|de\s+verdade))/i,
  /\b(at[eé]ndente|n[aã]o\s+rob[oô])/i,
  /\bn[aã]o\s+(quero|tô\s+querendo|estou\s+querendo)\s+(falar\s+com|usar)\s+(rob[oô]|bot|m[aá]quina)/i,
  /\bvoc[eê]\s+[eé]\s+(rob[oô]|bot|m[aá]quina)/i,
];

function customerAsksForHuman(text: string): boolean {
  return CUSTOMER_WANTS_HUMAN_PATTERNS.some((p) => p.test(text));
}

/**
 * Executa handoff completo pra humano:
 *   1. Posta nota interna (privada) com resumo
 *   2. Chama escalateToHuman (botMode=false + atribui agente)
 *   3. Caller deve definir state='escalated' depois
 *
 * Usado em vários cenários: detecção de "vou passar", cliente pede humano,
 * circuit breaker abriu, MAX_TOOL_ITERATIONS, etc.
 */
async function handoffToHuman(args: {
  channel: string;
  leadId: string;
  workspace: WorkspaceRecord | null;
  agent: { name: string };
  customerName?: string;
  customerPhone?: string;
  currentState: string;
  stateData: Record<string, unknown>;
  toolsUsed: string[];
  lastAgentReply?: string;
  reason: string;
}): Promise<void> {
  const summary = buildHandoffSummary({
    agentName: args.agent.name,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    currentState: args.currentState,
    stateData: args.stateData,
    toolsUsed: args.toolsUsed,
    lastAgentReply: args.lastAgentReply,
    reason: args.reason,
  });

  try {
    await crm.addInternalNote(args.channel, args.leadId, summary, args.workspace ?? undefined);
    console.log(`[loop] handoff summary postado leadId=${args.leadId}`);
  } catch (err) {
    console.warn(`[loop] falha postando nota interna:`, (err as Error).message);
  }

  try {
    await crm.escalateToHuman(args.channel, args.leadId, args.workspace ?? undefined);
  } catch (err) {
    console.warn(`[loop] escalateToHuman falhou:`, (err as Error).message);
  }
}

/**
 * Extrai mensagens do output do agente.
 * Suporta múltiplos formatos:
 *   - JSON puro: { "mensagem": "texto" } → ["texto"]
 *   - JSON puro: { "mensagens": ["a", "b"] } → ["a", "b"]
 *   - JSON em bloco markdown ```json ... ```
 *   - Texto + JSON misturados (extrai o JSON via balance counting)
 *   - Texto puro (fallback)
 */

function tryParseMessageJSON(s: string): string[] | null {
  try {
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as { mensagem?: unknown; mensagens?: unknown };
    if (Array.isArray(obj.mensagens) && obj.mensagens.every((m) => typeof m === 'string')) {
      return obj.mensagens as string[];
    }
    if (typeof obj.mensagem === 'string') {
      return [obj.mensagem];
    }
  } catch {
    // ignore
  }
  return null;
}

/** Encontra um objeto JSON balanceado a partir do primeiro `{` no texto. */
function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}

/**
 * Remove meta-comentários do output que vazam da "reasoning" de modelos
 * thinking (ex: gpt-5-mini, o1) — palavras como "calculating...",
 * "thinking...", "analyzing..." que aparecem como marcadores antes
 * da resposta real.
 */
function sanitizeMetaText(text: string): string {
  // 1) Remove blocos completos <thinking>...</thinking>, <reasoning>...</reasoning>, etc.
  let cleaned = text.replace(
    /<(thinking|reasoning|analysis|scratchpad|tool_call|function_call)\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );

  // 2) Remove linhas que são puro marcador de meta-reasoning ou narração de tool call
  const META_LINES = [
    // Marcadores de reasoning: "calculating...", "thinking...", etc.
    /^\s*(calculating|thinking|analyzing|checking|processing|reasoning|computing|verifying|evaluating|considering|reflecting)\s*\.{2,}\s*$/i,
    /^\s*(calculating|thinking|analyzing|processing)\s*$/i,
    // Tags soltas (caso não fechem)
    /^\s*<\/?(?:thinking|reasoning|analysis|scratchpad|tool_call|function_call)>\s*$/i,
    // Narração de tool calls em PT/EN: "Chamando listar_planos()...", "Calling X()", "Executando Y", "Invocando Z"
    /^\s*(chamando|executando|invocando|usando)\s+[a-z_]+(\s*\([^)]*\))?\s*\.{0,3}\s*$/i,
    /^\s*(calling|invoking|executing|using|running)\s+[a-z_]+(\s*\([^)]*\))?\s*\.{0,3}\s*$/i,
    // "Tool: X" / "Function: Y"
    /^\s*(tool|function|action)\s*:\s*[a-z_]+\s*$/i,
  ];

  cleaned = cleaned
    .split(/\r?\n/)
    .filter((line) => !META_LINES.some((p) => p.test(line)))
    .join('\n');

  // 3) Normaliza whitespace
  return cleaned
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMessages(raw: string): string[] {
  const cleaned = sanitizeMetaText(raw);
  const trimmed = cleaned.trim();

  // 1) JSON puro
  const direct = tryParseMessageJSON(trimmed);
  if (direct) return direct.map((m) => sanitizeMetaText(m));

  // 2) Bloco markdown ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    const fenced = tryParseMessageJSON(fenceMatch[1]);
    if (fenced) return fenced.map((m) => sanitizeMetaText(m));
  }

  // 3) Texto + JSON misturados — extrai JSON balanceado
  const embedded = extractBalancedJSON(trimmed);
  if (embedded) {
    const parsed = tryParseMessageJSON(embedded);
    if (parsed) return parsed.map((m) => sanitizeMetaText(m));
  }

  // 4) Fallback — texto puro
  return [trimmed];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runAgentLoop(job: AgentJob): Promise<void> {
  const start = Date.now();
  console.log(`[loop] start agentId=${job.agentId} leadId=${job.leadId}`);

  // 1. Carrega configuração do agent Thribus.
  //    M2: pode ser sobrescrito pelo roteador se for 1ª msg da conversa.
  let agent = await db.agents.findById(job.agentId);
  if (!agent) throw new Error(`Agent ${job.agentId} não encontrado no banco`);
  let activeAgentId = job.agentId;

  // 1.5. Carrega workspace (multi-tenant)
  const workspace = agent.workspaceId
    ? await db.workspaces.findById(agent.workspaceId).catch(() => null)
    : null;

  // 2. Busca lead completo no CRM (TexNet ou Talki — dispatcher decide)
  const lead = await crm.getLead(job.channel, job.leadId, workspace ?? undefined);

  // 3. ⚠️ SAFETY: só processa se botMode JÁ está true. Não ativa automaticamente!
  if (lead.botMode !== true) {
    console.log(`[loop] lead ${job.leadId} sem botMode ativo — ignorando`);
    return;
  }

  // 5. Garante conversation no banco e persiste mensagem recebida (dedup)
  const conversation = await db.conversations.findOrCreate({
    externalId: job.leadId,
    agentId: job.agentId,
    customerPhone: job.customerPhone,
    customerName: job.customerName,
  });

  // 5.1. M2 — Roteador multi-agente:
  // Se conversa tem agent_id diferente do default (ex: foi transferida no
  // turno anterior), usa esse. Senão, e se workspace tem router_config
  // habilitado E é a 1ª msg da conversa, classifica intent e troca agente.
  if (conversation.agentId !== job.agentId) {
    // Conversa já está com outro agente (transferência prévia)
    const transferredAgent = await db.agents.findById(conversation.agentId);
    if (transferredAgent) {
      console.log(`[loop] M2 conversa já transferida pra agent="${transferredAgent.name}" (${conversation.agentId})`);
      agent = transferredAgent;
      activeAgentId = conversation.agentId;
    }
  } else if (workspace?.routerConfig?.enabled) {
    // Verifica se é a 1ª msg (sem mensagens prévias do user no DB)
    const existingMsgs = await db.messages.listByConversation(conversation.id);
    const isFirstUserMessage = existingMsgs.length === 0;
    if (isFirstUserMessage) {
      console.log(`[loop] M2 router enabled — classificando intent...`);
      const decision = await routeMessage(
        job.content,
        workspace.routerConfig,
        workspace.llmApiKey,
      );
      if (decision && decision.targetAgentId !== job.agentId) {
        console.log(
          `[loop] M2 router: intent="${decision.intent}" → agent=${decision.targetAgentId} (confidence=${decision.confidence}, ${decision.reasoning})`,
        );
        const routedAgent = await db.agents.findById(decision.targetAgentId);
        if (routedAgent) {
          await db.conversations.transferToAgent(
            conversation.id,
            decision.targetAgentId,
            job.agentId,
            `router: ${decision.reasoning}`,
          );
          agent = routedAgent;
          activeAgentId = decision.targetAgentId;
        } else {
          console.warn(`[loop] M2 router escolheu agent_id=${decision.targetAgentId} mas não existe — segue com default`);
        }
      } else if (decision) {
        console.log(`[loop] M2 router: intent="${decision.intent}" mantém agent default ${job.agentId}`);
      }
    }
  }

  await db.messages.save({
    conversationId: conversation.id,
    role: 'user',
    content: job.content,
    externalId: job.messageId,
  });

  // 6. Monta histórico de mensagens para o LLM.
  //
  // Estratégia híbrida (cache local + CRM como fallback):
  //   - Lê do nosso DB primeiro (rápido, ~50ms)
  //   - Se DB vazio (conversa nova ou primeira interação), hidrata do CRM
  //     copiando as msgs pra cá. Próximos turnos leem só do DB.
  //   - Cleanup automático ao final: quando estado vira terminal
  //     (11_completed/sem_cobertura/escalated), apaga as msgs do DB.
  //     CRM permanece como source of truth permanente.
  const HISTORY_KEEP_TURNS = Number(process.env.HISTORY_KEEP_TURNS ?? 20);

  let dbMsgs = await db.messages.listByConversation(conversation.id);

  // Hidrata se DB vazio mas CRM tem histórico
  if (dbMsgs.length === 0 && (lead.messages?.length ?? 0) > 0) {
    const toHydrate = (lead.messages ?? [])
      .filter((m) => m.type === 'text')
      .map((m) => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: m.content,
        externalId: m.id,
        createdAt: m.createdAt,
      }));
    await db.messages.bulkSave(conversation.id, toHydrate);
    console.log(
      `[loop] hydrated DB from CRM count=${toHydrate.length} convId=${conversation.id}`,
    );
    dbMsgs = await db.messages.listByConversation(conversation.id);
  }

  // Filtra só user/assistant (descarta tool/system)
  const history = dbMsgs.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  );
  const trimmed = history.slice(-HISTORY_KEEP_TURNS);
  const droppedCount = history.length - trimmed.length;
  if (droppedCount > 0) {
    console.log(
      `[loop] history trim: kept=${trimmed.length} dropped=${droppedCount} (HISTORY_KEEP_TURNS=${HISTORY_KEEP_TURNS})`,
    );
  }
  // Constrói mensagens — se conteúdo tiver [image_url: ...], converte pra
  // content blocks multimodais (texto + imagem) compatíveis com Anthropic/OpenAI.
  const messages: MessageParam[] = await Promise.all(
    trimmed.map(async (m) => {
      const role = m.role as 'user' | 'assistant';
      const { urls, text } = extractImageRefs(m.content);
      if (urls.length === 0 || role === 'assistant') {
        return { role, content: m.content };
      }
      // Build multimodal content: imagens + texto
      const blocks: Array<unknown> = [];
      for (const url of urls) {
        const block = await urlToAnthropicImageBlock(url);
        if (block) blocks.push(block);
      }
      if (text) blocks.push({ type: 'text', text });
      return blocks.length > 0
        ? ({ role, content: blocks } as MessageParam)
        : { role, content: m.content };
    }),
  );

  // Garante que a mensagem atual está ao final (pode já estar no histórico)
  const lastMsg = messages[messages.length - 1];
  const lastContentText =
    typeof lastMsg?.content === 'string' ? lastMsg.content : '';
  if (!lastMsg || lastMsg.role !== 'user' || lastContentText !== job.content) {
    // Processa job.content também pra suportar imagem na mensagem atual
    const { urls: jobUrls, text: jobText } = extractImageRefs(job.content);
    if (jobUrls.length > 0) {
      const blocks: Array<unknown> = [];
      for (const url of jobUrls) {
        const block = await urlToAnthropicImageBlock(url);
        if (block) blocks.push(block);
      }
      if (jobText) blocks.push({ type: 'text', text: jobText });
      messages.push({ role: 'user', content: blocks } as MessageParam);
    } else {
      messages.push({ role: 'user', content: job.content });
    }
  }

  // 7. Carrega tool definitions (do agente ATIVO — pode ser o roteado pelo M2)
  // ─── M3 runtime ─────────────────────────────────────────────────────────────
  // Antes de buscar as tools, mescla o que vem das skills habilitadas.
  // Quando M3_SKILLS_ENABLED=false (default), enrichWithSkills é no-op.
  // Quando true, system_prompt ganha os fragments + tools list ganha os
  // required_tools de cada skill (deduplicado).
  const enriched = await enrichWithSkills({
    agentId: activeAgentId,
    systemPrompt: agent.systemPrompt,
    tools: agent.tools,
  });

  if (enriched.enriched && enriched.appliedSkills.length > 0) {
    // Substitui o agent in-memory pra refletir o prompt + tools enriquecidos.
    // O DB não é alterado — é só o objeto local usado neste turno.
    agent = { ...agent, systemPrompt: enriched.systemPrompt, tools: enriched.tools };
  }

  const toolRecords = await db.tools.listByAgent(activeAgentId);
  const toolDefs: ToolDefinition[] = toolRecords.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: getToolInputSchema(t.name),
  }));

  // 8. Estado da conversa (state machine)
  let currentState = conversation.currentState ?? '1_welcome';
  const stateData: Record<string, unknown> = { ...(conversation.stateData ?? {}) };
  const stateChanged = (newState: string): boolean => newState !== currentState;
  const persistState = async () => {
    await db.conversations.setState(conversation.id, currentState, stateData).catch((err) => {
      console.warn(`[loop] falha ao persistir estado leadId=${job.leadId}:`, err);
    });
  };

  console.log(`[loop] state at entry=${currentState} dataKeys=[${Object.keys(stateData).join(',')}]`);

  // ── Check 1: cliente pediu humano explicitamente ─────────────────────────
  // Se a mensagem atual contém "quero falar com atendente / pessoa / humano",
  // escala IMEDIATAMENTE sem invocar LLM. Economiza tokens + acelera handoff.
  if (customerAsksForHuman(job.content)) {
    console.log(`[loop] customer asked for human leadId=${job.leadId} content="${job.content.slice(0, 80)}"`);
    const ackMsg = 'Entendido! Vou passar você para o time responsável agora mesmo. Já já alguém vai te atender. 🙌';
    try {
      await crm.sendMessage(job.channel, job.leadId, ackMsg, workspace ?? undefined);
    } catch (err) {
      console.warn(`[loop] falha enviando ack de handoff:`, (err as Error).message);
    }
    await handoffToHuman({
      channel: job.channel,
      leadId: job.leadId,
      workspace: workspace ?? null,
      agent: { name: agent.name },
      customerName: job.customerName,
      customerPhone: job.customerPhone,
      currentState,
      stateData,
      toolsUsed: [],
      lastAgentReply: ackMsg,
      reason: 'Cliente solicitou atendimento humano explicitamente.',
    });
    currentState = 'escalated';
    await persistState();
    await db.messages.deleteAllForConversation(conversation.id).catch(() => 0);
    await db.conversations.close(conversation.id).catch(() => undefined);
    console.log(`[loop] done leadId=${job.leadId} status=escalated reason=customer_asked_human`);
    return;
  }

  // 9. Loop agêntico
  const toolsUsed: string[] = [];
  const toolFailures: Record<string, number> = {}; // circuit breaker
  const MAX_TOOL_FAILURES = 3;
  let circuitBreakerTripped = false; // se true, escala ao final do turno
  let promiseRetries = 0;
  const MAX_PROMISE_RETRIES = 1;
  // Idempotência: se o LLM tentar a MESMA tool com EXATAMENTE o MESMO input
  // que já rodou nesta sessão, devolvemos o output anterior + aviso —
  // evita criar OSes duplicadas no IXC, gastar API n8n à toa e loop infinito
  // do LLM "esperando confirmação". Key = toolName|JSON.stringify(input).
  const calledTools = new Map<string, string>();
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let cacheReadTokens = 0;
  let finalText: string | null = null;
  let exitReason: 'resolved' | 'escalated' | 'failed' | 'transferred' = 'failed';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // Re-verifica botMode a cada iteração (humano pode assumir no meio)
    if (iter > 0) {
      const refreshed = await crm.getLead(job.channel, job.leadId, workspace ?? undefined);
      if (refreshed.botMode === false) {
        console.log(`[loop] humano assumiu durante loop iter=${iter} — cancelando`);
        return;
      }
    }

    console.log(`[loop] iter=${iter} state=${currentState} agentId=${job.agentId} leadId=${job.leadId}`);

    // Injeta state reminder no final do system prompt — modelo lê estado atual
    // + dados já coletados, eliminando inferência por histórico.
    const stateReminder = buildStateReminder(currentState, stateData);
    const augmentedSystemPrompt = `${agent.systemPrompt}\n\n${stateReminder}`;

    // Após anti-promise, força tool. Se o estado atual tem expectedTool E ela
    // está disponível, força ela especificamente (mais determinístico).
    let forceToolName: string | undefined;
    let forceTool = false;
    if (promiseRetries > 0 && toolDefs.length > 0) {
      const expected = SALES_FLOW_STATES[currentState]?.expectedTool;
      if (expected && toolDefs.some((t) => t.name === expected)) {
        forceToolName = expected;
      } else {
        forceTool = true;
      }
    }

    const response = await callLLM({
      model: agent.model,
      systemPrompt: augmentedSystemPrompt,
      tools: toolDefs,
      messages,
      apiKey: workspace?.llmApiKey,
      forceTool,
      forceToolName,
    });

    totalTokensIn += response.usage.inputTokens;
    totalTokensOut += response.usage.outputTokens;
    cacheReadTokens += response.usage.cacheReadTokens;

    // ── Tool use ──────────────────────────────────────────────────────────
    if (response.stopReason === 'tool_use' && response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.toolCalls.map((tc) => ({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      });

      // Circuit breaker: substitui chamadas a tools que já falharam MAX vezes
      const results = await Promise.all(
        response.toolCalls.map(async (tc) => {
          const fails = toolFailures[tc.name] ?? 0;
          if (fails >= MAX_TOOL_FAILURES) {
            console.warn(`[loop] tool="${tc.name}" circuit-breaker tripped (${fails} failures) — short-circuiting`);
            circuitBreakerTripped = true;
            return {
              toolCallId: tc.id,
              toolName: tc.name,
              output: JSON.stringify({
                error: `Tool "${tc.name}" indisponível no momento (falhou ${fails} vezes nesta conversa). NÃO TENTE NOVAMENTE. Informe o cliente que houve um problema técnico e que a equipe foi notificada, ou peça os dados de outra forma.`,
              }),
              error: 'circuit_breaker_open',
              durationMs: 0,
            };
          }

          // Idempotência: se o LLM já chamou esta tool com este input nesta
          // sessão, NÃO reexecuta. Devolve o output anterior + aviso pra ele
          // usar o resultado e seguir o fluxo (em vez de re-chamar em loop).
          const callKey = `${tc.name}|${JSON.stringify(tc.input)}`;
          const previousOutput = calledTools.get(callKey);
          if (previousOutput) {
            console.warn(`[loop] tool="${tc.name}" chamada duplicada com mesmo input — devolvendo cache + aviso`);
            return {
              toolCallId: tc.id,
              toolName: tc.name,
              output: JSON.stringify({
                _cached: true,
                _aviso: `Esta tool já foi chamada nesta conversa com EXATAMENTE estes mesmos parâmetros e a operação foi concluída. NÃO chame de novo. Use o resultado abaixo e continue o fluxo (responda ao cliente com a confirmação).`,
                resultado_anterior: tryParseJson(previousOutput),
              }),
              durationMs: 0,
            };
          }

          return executeTool(tc.id, tc.name, tc.input, activeAgentId, {
            conversationId: conversation.id,
            workspaceId: agent.workspaceId,
            channel: job.channel,
            sendMessage: async (content: string) => {
              await crm.sendMessage(job.channel, job.leadId, content, workspace ?? undefined);
            },
          });
        }),
      );

      for (let ri = 0; ri < results.length; ri++) {
        const r = results[ri];
        const tc = response.toolCalls[ri];
        toolsUsed.push(r.toolName);
        if (r.error) {
          toolFailures[r.toolName] = (toolFailures[r.toolName] ?? 0) + 1;
          continue;
        }
        console.log(`[loop] tool="${r.toolName}" durationMs=${r.durationMs} ok`);

        // Registra no map de idempotência (key = name|input). Próxima vez que
        // o LLM tentar chamar com mesmo input, o pre-check em cima devolve
        // o cache em vez de reexecutar.
        if (tc) {
          const callKey = `${tc.name}|${JSON.stringify(tc.input)}`;
          if (!calledTools.has(callKey)) {
            calledTools.set(callKey, r.output);
          }
        }

        // Atualiza state machine com base no output da tool
        const extracted = extractStateData(r.toolName, r.output);
        if (Object.keys(extracted).length > 0) {
          Object.assign(stateData, extracted);
        }
        const next = nextStateAfterTool(currentState, r.toolName, r.output);
        if (next && stateChanged(next)) {
          console.log(`[loop] state transition ${currentState} -> ${next} via ${r.toolName}`);
          currentState = next;
        }
      }

      // Persiste estado após todas as tools desta iteração
      await persistState();

      messages.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.output,
        })),
      });

      // M2: detecta transferência via transferir_para_agente — interrompe turno
      // O próximo turno (próxima msg do user) vai pegar o agente novo da
      // conversation.agent_id atualizada.
      const transferred = results.find((r) => r.conversationTransferred);
      if (transferred?.conversationTransferred) {
        const t = transferred.conversationTransferred;
        console.log(`[loop] conversa transferida pra agent="${t.newAgentName}" (${t.newAgentId}) — encerrando turno atual`);
        exitReason = 'transferred';
        await persistState();
        // Não escala humano — só passa pro próximo agente. Bot continua ativo.
        return;
      }

      // Escalonamento via tool — internal `escalar_humano` seta result.escalated.
      // O loop centraliza o handoff via handoffToHuman (nota interna +
      // botMode=false + stage=aguardando + responsibleId=null) — assim
      // a internal tool fica enxuta e auditável (só registra o motivo).
      const escalation = results.find((r) => r.escalated);
      if (escalation?.escalated) {
        console.log(`[loop] tool escalar_humano chamada motivo="${escalation.escalated.motivo}"`);
        await handoffToHuman({
          channel: job.channel,
          leadId: job.leadId,
          workspace: workspace ?? null,
          agent: { name: agent.name },
          customerName: job.customerName,
          customerPhone: job.customerPhone,
          currentState,
          stateData,
          toolsUsed,
          lastAgentReply: undefined,
          reason: escalation.escalated.motivo,
        });
        exitReason = 'escalated';
        currentState = 'escalated';
        await persistState();
        break;
      }

      // Estado terminal alcançado (ex: 11_completed após criar_os_agendamento
      // sucesso). Em vez de continuar o loop e deixar o LLM tentar mais tools
      // (criando duplicatas no IXC), forçamos UMA chamada extra SEM tools pra
      // ele gerar a confirmação ao cliente, enviamos, e quebramos o loop.
      if (isTerminalState(currentState) && currentState !== 'escalated') {
        console.log(`[loop] terminal state="${currentState}" alcançado — forçando resposta final sem tools`);
        const finalResponse = await callLLM({
          model: agent.model,
          systemPrompt: `${agent.systemPrompt}\n\n${buildStateReminder(currentState, stateData)}\n\nIMPORTANTE: O atendimento foi concluído com sucesso. Envie AGORA a mensagem de confirmação final ao cliente com os dados do agendamento (data, horário, OS). NÃO chame mais tools — apenas responda em texto.`,
          tools: [], // sem tools — força texto
          messages,
          apiKey: workspace?.llmApiKey,
        });
        totalTokensIn += finalResponse.usage.inputTokens;
        totalTokensOut += finalResponse.usage.outputTokens;
        cacheReadTokens += finalResponse.usage.cacheReadTokens;

        if (finalResponse.text) {
          finalText = finalResponse.text;
          const connected = await crm.isChannelConnected(job.channel, workspace ?? undefined);
          if (connected) {
            const messagesToSend = extractMessages(finalText);
            for (let i = 0; i < messagesToSend.length; i++) {
              await crm.sendMessage(job.channel, job.leadId, messagesToSend[i], workspace ?? undefined);
              if (i < messagesToSend.length - 1) {
                await new Promise((r) => setTimeout(r, 600));
              }
            }
            await db.messages.save({
              conversationId: conversation.id,
              role: 'assistant',
              content: finalText,
              tokensIn: totalTokensIn,
              tokensOut: totalTokensOut,
              cacheHit: cacheReadTokens > 0,
            });
          }
          exitReason = 'resolved';
          await persistState();
          break;
        }
        // Sem texto e sem tools? Algo bem estranho. Deixa cair no fluxo padrão.
      }

      continue;
    }

    // ── Resposta final em texto ───────────────────────────────────────────
    if (response.text) {
      const isPromise = looksLikePromise(response.text);
      console.log(
        `[loop] iter=${iter} text-only response, len=${response.text.length}, promise=${isPromise}, tools=${toolDefs.length}, retries=${promiseRetries}`,
      );

      // Anti-promise: se prometeu ação sem chamar tool, ENVIA o anúncio
      // ao cliente (pra ele saber que o sistema está trabalhando) e
      // continua o loop forçando a tool ser chamada na próxima iteração.
      if (
        promiseRetries < MAX_PROMISE_RETRIES &&
        toolDefs.length > 0 &&
        looksLikePromise(response.text)
      ) {
        console.warn(
          `[loop] anti-promise tripped iter=${iter} retry=${promiseRetries + 1} text="${response.text.slice(0, 100).replace(/\n/g, ' ')}..." — sending ack and forcing tool`,
        );
        promiseRetries++;

        // 1. Envia o anúncio ao cliente (assim ele sabe que o sistema entendeu).
        const connected = await crm.isChannelConnected(job.channel, workspace ?? undefined);
        if (connected) {
          const ackMessages = extractMessages(response.text);
          for (let i = 0; i < ackMessages.length; i++) {
            await crm.sendMessage(job.channel, job.leadId, ackMessages[i], workspace ?? undefined);
            if (i < ackMessages.length - 1) {
              await new Promise((r) => setTimeout(r, 600));
            }
          }
          await db.messages.save({
            conversationId: conversation.id,
            role: 'assistant',
            content: response.text,
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            cacheHit: cacheReadTokens > 0,
          });
        }

        // 2. Adiciona o anúncio ao histórico + injeta instrução pra forçar a tool.
        messages.push({ role: 'assistant', content: response.text });
        messages.push({
          role: 'user',
          content:
            'SISTEMA (não exibido ao cliente): O anúncio que você acabou de fazer já foi entregue ao cliente. ' +
            'AGORA você DEVE executar a ação prometida chamando a tool correspondente. ' +
            'Sua próxima resposta tem que ser uma chamada de tool — NÃO envie mais texto explicativo, ' +
            'NÃO repita o aviso, NÃO peça mais informações. Chame a tool e depois responda com o resultado real.',
        });
        continue;
      }

      finalText = response.text;

      // Verifica canal conectado antes de enviar
      const connected = await crm.isChannelConnected(job.channel, workspace ?? undefined);
      if (!connected) {
        console.warn(`[loop] canal ${job.channel} desconectado — não enviando`);
        exitReason = 'failed';
        break;
      }

      // Suporte a output JSON: { "mensagem": "..." } ou { "mensagens": ["...", "..."] }
      const messagesToSend = extractMessages(finalText);

      // Audio out: se agente tem audio_out_enabled E o cliente mandou áudio
      // (job.messageType === 'audio'), responde a primeira mensagem em áudio
      // (TTS) + restante em texto. Suporta Talki E TexNet.
      const wantAudioReply =
        agent.audioOutEnabled &&
        job.messageType === 'audio';

      for (let i = 0; i < messagesToSend.length; i++) {
        const msg = messagesToSend[i];
        // Primeira mensagem em áudio se opt-in; restantes em texto
        if (i === 0 && wantAudioReply) {
          const audio = await generateSpeech(msg, {
            apiKey: workspace?.llmApiKey,
            voice: 'nova',
            format: 'opus',
          });
          if (audio) {
            try {
              if (job.channel.startsWith('talki:')) {
                const cfg = talki.configFromWorkspace(workspace ?? undefined);
                await talki.messages.sendAudio(
                  Number(job.leadId),
                  audio,
                  { filename: 'resposta.ogg', mimeType: 'audio/ogg' },
                  cfg,
                );
              } else {
                // TexNet (default) — usa POST /messages/media
                const cfg = texnet.configFromWorkspace(workspace ?? undefined);
                await texnet.messages.sendAudio(
                  job.leadId,
                  audio,
                  { filename: 'resposta.ogg', mimeType: 'audio/ogg' },
                  cfg,
                );
              }
              // Não envia o texto correspondente — a transcrição é representada pelo áudio
              if (i < messagesToSend.length - 1) {
                await new Promise((r) => setTimeout(r, 600));
              }
              continue;
            } catch (err) {
              console.warn(`[loop] audio out falhou, fallback pra texto:`, (err as Error).message);
            }
          }
        }
        await crm.sendMessage(job.channel, job.leadId, msg, workspace ?? undefined);
        if (i < messagesToSend.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      exitReason = 'resolved';

      await db.messages.save({
        conversationId: conversation.id,
        role: 'assistant',
        content: finalText,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        cacheHit: cacheReadTokens > 0,
      });

      // Auto-escalation por três gatilhos no mesmo turno:
      //   (a) Agente disse "vou passar pra time" → handoff intencional
      //   (b) Circuit breaker disparou (tool falhou 3x) → handoff por erro técnico
      //   (c) Viabilidade indisponível pelo Geogrid — agente diz que não conseguiu
      //       verificar e o time confirma manualmente (pode ter cobertura via outra base
      //       ou ser falso negativo do Geogrid; vale o time olhar antes de descartar).
      const reasonToEscalate = looksLikeEscalation(finalText)
        ? 'Bot encaminhou pro time (handoff detectado).'
        : circuitBreakerTripped
        ? 'Bot encaminhou pro time (problema técnico — tool falhou 3 vezes nesta conversa).'
        : currentState === 'sem_cobertura'
        ? 'Viabilidade indisponível pelo Geogrid — confirmar manualmente se há cobertura no endereço.'
        : null;

      if (reasonToEscalate) {
        console.log(
          `[loop] auto-escalation leadId=${job.leadId} reason="${reasonToEscalate}"`,
        );
        await handoffToHuman({
          channel: job.channel,
          leadId: job.leadId,
          workspace: workspace ?? null,
          agent: { name: agent.name },
          customerName: job.customerName,
          customerPhone: job.customerPhone,
          currentState,
          stateData,
          toolsUsed,
          lastAgentReply: finalText,
          reason: reasonToEscalate,
        });
        exitReason = 'escalated';
        currentState = 'escalated';
      }

      // Persist final state (pode ter mudado durante esta iter via tools)
      await persistState();

      break;
    }

    console.warn(`[loop] resposta vazia iter=${iter}`);
    break;
  }

  // Estourou iterações sem resposta → escala pra humano.
  // Antes ficava como 'failed' silencioso, mas o user pediu pra TODO caso
  // não-conclusivo virar handoff (não deixar conversa órfã).
  if (!finalText && exitReason === 'failed') {
    console.log(
      `[loop] MAX_TOOL_ITERATIONS atingido leadId=${job.leadId} — escalando pra humano`,
    );
    await handoffToHuman({
      channel: job.channel,
      leadId: job.leadId,
      workspace: workspace ?? null,
      agent: { name: agent.name },
      customerName: job.customerName,
      customerPhone: job.customerPhone,
      currentState,
      stateData,
      toolsUsed,
      lastAgentReply: undefined,
      reason: `Bot atingiu limite de iterações (${MAX_TOOL_ITERATIONS}) sem conseguir responder. Escalado automaticamente.`,
    });
    exitReason = 'escalated';
    currentState = 'escalated';
    await persistState();
  }

  const durationMs = Date.now() - start;
  console.log(
    `[loop] done leadId=${job.leadId} status=${exitReason} tools=[${toolsUsed.join(',')}] tokens=${totalTokensIn + totalTokensOut} cacheRead=${cacheReadTokens} ms=${durationMs}`,
  );

  // Mapeia 'transferred' (M2) pra 'resolved' no save — schema da execution
  // tem 4 valores fixos. Conceitualmente, esse turno foi resolvido (passou pro
  // agente certo); o próximo turno do user vai gerar nova execution pelo agente novo.
  // Cast pra string burla narrowing — em runtime exitReason pode SIM ser 'transferred'
  // se o code path do return early for tomado (TS não detecta porque tem mutation).
  const persistedStatus = (exitReason as string) === 'transferred'
    ? ('resolved' as const)
    : exitReason;
  await db.executions.save({
    agentId: activeAgentId, // M2: stats vão pro agente que de fato atendeu
    conversationId: conversation.id,
    customerPhone: job.customerPhone,
    customerName: job.customerName,
    status: persistedStatus,
    toolsUsed: [...new Set(toolsUsed)],
    responseTimeMs: durationMs,
    totalTokens: totalTokensIn + totalTokensOut,
    cacheReadTokens,
  });

  // Se escalou, registra na tabela escalations
  if (exitReason === 'escalated') {
    await db.escalations.create({
      agentId: activeAgentId, // M2: escalation atribuída ao agente que escalou
      conversationId: conversation.id,
      customerPhone: job.customerPhone,
      customerName: job.customerName,
      reason: 'Bot transferiu para humano',
      priority: 'medium',
    }).catch((err) => console.warn('[loop] falha ao registrar escalation', err));
  }

  // Cleanup: ao chegar em estado terminal, apaga histórico do nosso DB.
  // CRM permanece como source of truth permanente.
  if (isTerminalState(currentState)) {
    const removed = await db.messages
      .deleteAllForConversation(conversation.id)
      .catch((err) => {
        console.warn(`[loop] falha cleanup msgs convId=${conversation.id}:`, err);
        return 0;
      });
    await db.conversations.close(conversation.id).catch(() => undefined);
    console.log(
      `[loop] cleanup terminal_state=${currentState} convId=${conversation.id} msgs_removed=${removed}`,
    );
  }
}
