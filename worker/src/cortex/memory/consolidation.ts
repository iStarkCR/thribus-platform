/**
 * Consolidation Worker — gera resumos + fatos a partir de sessões ativas.
 *
 * Roda em loop (setInterval) ou on-demand. Para cada sessão com mensagens
 * acima de threshold ou inativa por X minutos:
 *   1. Pega as mensagens da sessão (short-term memory)
 *   2. Pede pro LLM gerar:
 *      - 1 summary text (≤500 chars)
 *      - até 5 facts categorizados sobre a entidade
 *      - até 3 top intents
 *   3. Persiste em cortex_session_summaries + cortex_facts
 *   4. Limpa a sessão da memória curta
 *
 * Triggers:
 *   - Sessão inativa > IDLE_MS (default 15min)
 *   - Sessão com > MAX_MSGS (default 30)
 *
 * Custo: usa Haiku (mais barato). ~1k tokens por consolidação.
 */

import { callLLM } from '../../llm/client.js';
import { calculateCost } from '../../llm/cost.js';
import type { ToolDefinition } from '../../llm/types.js';
import { agentRegistry } from '../agents/registry.js';
import { createLogger } from '../observability/logger.js';
import { incrementCounter } from '../observability/metrics.js';
import type { CortexSession, EntityRef } from '../types.js';
import { longTermMemory } from './long-term.js';
import { shortTermMemory } from './short-term.js';

const logger = createLogger('cortex.consolidation');

const CONSOLIDATION_MODEL =
  process.env.CORTEX_CONSOLIDATION_MODEL || 'claude-haiku-4-5-20251001';
const IDLE_MS = Number(process.env.CORTEX_CONSOLIDATION_IDLE_MS ?? 15 * 60 * 1000);
const MAX_MSGS = Number(process.env.CORTEX_CONSOLIDATION_MAX_MSGS ?? 30);
const INTERVAL_MS = Number(process.env.CORTEX_CONSOLIDATION_INTERVAL_MS ?? 5 * 60 * 1000);

const CONSOLIDATE_TOOL: ToolDefinition = {
  name: 'consolidate_session',
  description:
    'Resume a sessão em summary + facts + intents — pra alimentar memória de longo prazo do Cortex Brain.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Resumo da sessão em até 500 chars. Foco em o que aconteceu/o que foi decidido.',
      },
      top_intents: {
        type: 'array',
        description: 'Até 3 intents detectados (ex: "consultar viabilidade", "negociar débito").',
      },
      facts: {
        type: 'array',
        description:
          'Até 5 fatos discretos aprendidos sobre o cliente. Cada fato deve ser uma frase factual útil pra atendimentos futuros.',
      },
      agents_involved: {
        type: 'array',
        description: 'IDs dos agentes que apareceram na sessão.',
      },
    },
    required: ['summary'],
  },
};

interface ConsolidationOutput {
  summary: string;
  topIntents: string[];
  facts: Array<{ text: string; category?: string; confidence?: number }>;
  agentsInvolved: string[];
}

function buildConsolidationPrompt(): string {
  const agentList = agentRegistry.list().map((a) => a.id).join(', ');
  return `Você é o módulo de consolidação de memória do Cortex Brain.

Receberá o histórico de uma sessão de atendimento. Sua função é:
1. Resumir em até 500 chars o que aconteceu (summary)
2. Identificar até 3 intents principais (top_intents)
3. Extrair até 5 fatos FACTUAIS sobre o cliente (facts) — coisas que serão úteis em atendimentos futuros
4. Listar os agentes envolvidos (agents_involved)

Agentes disponíveis: ${agentList}

REGRAS:
- Use SEMPRE a tool "consolidate_session"
- Facts devem ser FACTUAIS, não interpretações ("cliente prefere noite" sim; "cliente é difícil" não)
- Se nada relevante, summary curto e facts vazio é OK
- Em português brasileiro`;
}

async function consolidateSession(session: CortexSession): Promise<{
  output: ConsolidationOutput;
  costUsd: number;
} | null> {
  const messages = session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n');

  if (!messages.trim()) return null;

  const entityHeader = session.entity
    ? `[ENTIDADE] ${session.entity.type}#${session.entity.id}${
        session.entity.displayName ? ` (${session.entity.displayName})` : ''
      }\n`
    : '';

  try {
    const response = await callLLM({
      model: CONSOLIDATION_MODEL,
      systemPrompt: buildConsolidationPrompt(),
      tools: [CONSOLIDATE_TOOL],
      messages: [
        {
          role: 'user',
          content: `${entityHeader}[HISTÓRICO]\n${messages}`,
        },
      ],
      forceToolName: 'consolidate_session',
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) return null;

    const input = toolCall.input as {
      summary: string;
      top_intents?: string[];
      facts?: Array<{ text?: string; category?: string; confidence?: number } | string>;
      agents_involved?: string[];
    };

    const facts =
      (input.facts ?? [])
        .map((f) => {
          if (typeof f === 'string') return { text: f };
          if (f && typeof f === 'object' && 'text' in f && typeof f.text === 'string') {
            return {
              text: f.text,
              category: f.category,
              confidence: typeof f.confidence === 'number' ? f.confidence : undefined,
            };
          }
          return null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 5);

    const costUsd = calculateCost(
      {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cacheReadTokens: response.usage.cacheReadTokens,
        cacheCreationTokens: 0,
      },
      CONSOLIDATION_MODEL,
    );

    return {
      output: {
        summary: String(input.summary ?? '').slice(0, 4000),
        topIntents: (input.top_intents ?? []).slice(0, 3).map(String),
        facts,
        agentsInvolved: (input.agents_involved ?? []).slice(0, 10).map(String),
      },
      costUsd,
    };
  } catch (err) {
    logger.warn('consolidateSession failed', { error: (err as Error).message });
    return null;
  }
}

/**
 * Persiste a consolidação. Idempotente — chamadas duplicadas geram summaries
 * separados (queries vão pegar o mais recente).
 */
async function persistConsolidation(
  session: CortexSession,
  output: ConsolidationOutput,
  costUsd: number,
): Promise<void> {
  // 1. Session summary
  await longTermMemory.saveSummary(session.tenantId, session.sessionId, session.entity, {
    summaryText: output.summary,
    topIntents: output.topIntents,
    agentsInvolved: output.agentsInvolved,
    messageCount: session.messages.length,
    totalCostUsd: costUsd,
  });

  // 2. Facts (só se entity definida)
  if (session.entity) {
    for (const f of output.facts) {
      await longTermMemory.addFact(session.tenantId, session.entity, {
        factText: f.text,
        category: f.category,
        confidence: f.confidence ?? 0.7,
        sourceSession: session.sessionId,
      });
    }
  }
}

/**
 * Overflow handler — sessão estourou o limite da memória curta antes do pass
 * periódico. Consolida o que vai ser descartado SEM limpar a sessão (ela
 * continua ativa). Debounce de 60s por sessão pra não consolidar a cada msg.
 */
const overflowInFlight = new Set<string>();

function handleOverflow(session: CortexSession): void {
  const key = `${session.tenantId}::${session.sessionId}`;
  if (overflowInFlight.has(key)) return;
  overflowInFlight.add(key);
  void (async () => {
    try {
      const result = await consolidateSession(session);
      if (result) {
        await persistConsolidation(session, result.output, result.costUsd);
        incrementCounter('cortex_consolidations_total', { tenant: session.tenantId });
        logger.info('overflow consolidation', {
          tenantId: session.tenantId,
          sessionId: session.sessionId,
          facts: result.output.facts.length,
        });
      }
    } catch (err) {
      logger.warn('overflow consolidation failed', { error: (err as Error).message });
    } finally {
      const t = setTimeout(() => overflowInFlight.delete(key), 60_000);
      t.unref?.();
    }
  })();
}

/**
 * Consolida uma sessão específica (sob demanda — útil pra testar via admin endpoint).
 */
export async function consolidateSessionById(
  tenantId: string,
  sessionId: string,
): Promise<{ ok: boolean; reason?: string; output?: ConsolidationOutput }> {
  const session = shortTermMemory.get(tenantId, sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.messages.length < 2)
    return { ok: false, reason: 'session_too_short' };

  const result = await consolidateSession(session);
  if (!result) return { ok: false, reason: 'llm_failed' };

  await persistConsolidation(session, result.output, result.costUsd);
  incrementCounter('cortex_consolidations_total', { tenant: tenantId });
  logger.info('session consolidated', {
    tenantId,
    sessionId,
    facts: result.output.facts.length,
    intents: result.output.topIntents.length,
    costUsd: result.costUsd,
  });
  shortTermMemory.clear(tenantId, sessionId);
  return { ok: true, output: result.output };
}

/**
 * Worker periódico — varre todas as sessões e consolida as elegíveis.
 * No-op atualmente porque shortTermMemory não expõe iteração.
 * Vou expor `listAll()` em short-term.ts pra habilitar isso.
 */
let intervalHandle: NodeJS.Timeout | null = null;

export function startConsolidationWorker(): void {
  if (intervalHandle) return;
  logger.info('consolidation worker started', {
    intervalMs: INTERVAL_MS,
    idleMs: IDLE_MS,
    maxMsgs: MAX_MSGS,
  });
  shortTermMemory.setOverflowHandler(handleOverflow);
  intervalHandle = setInterval(() => {
    void runConsolidationPass().catch((err) =>
      logger.error('consolidation pass failed', { error: (err as Error).message }),
    );
  }, INTERVAL_MS);
  // Não bloqueia o shutdown do processo
  intervalHandle.unref?.();
}

export function stopConsolidationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    shortTermMemory.setOverflowHandler(null);
    logger.info('consolidation worker stopped');
  }
}

/** Uma passada — varre sessões elegíveis e consolida. */
export async function runConsolidationPass(): Promise<{ consolidated: number }> {
  const candidates = shortTermMemory.listAll();
  let consolidated = 0;
  const now = Date.now();

  for (const session of candidates) {
    const updatedAt = new Date(session.updatedAt).getTime();
    const idle = now - updatedAt;
    const shouldConsolidate =
      idle >= IDLE_MS || session.messages.length >= MAX_MSGS;
    if (!shouldConsolidate) continue;

    const result = await consolidateSession(session);
    if (!result) continue;

    await persistConsolidation(session, result.output, result.costUsd);
    shortTermMemory.clear(session.tenantId, session.sessionId);
    consolidated += 1;
    incrementCounter('cortex_consolidations_total', { tenant: session.tenantId });
  }

  if (consolidated > 0) {
    logger.info('consolidation pass complete', { consolidated });
  }
  return { consolidated };
}

