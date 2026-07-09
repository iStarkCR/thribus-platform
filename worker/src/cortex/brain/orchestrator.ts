/**
 * Brain Orchestrator — coração do Cortex Brain.
 *
 * Pipeline (Fase 0):
 *   1. Pega/cria sessão (memória curta)
 *   2. Anexa input do usuário
 *   3. analyze() → decide agente + intent + insights
 *   4. Se agent=null → reply direta do Brain
 *      Se agent=X    → runAgent(X) → reply do agente
 *   5. Anexa reply na sessão
 *   6. writeAudit()
 *   7. Retorna AnalyzeResponse
 *
 * Fase 1: tool_use loop, multi-agent handoff, streaming.
 * Fase 2: guardrails, cost limit, PII masking.
 */

import { randomUUID } from 'node:crypto';
import { calculateCost } from '../../llm/cost.js';
import { supabase } from '../../db/supabase.js';
import { executeAgent } from '../agents/executor.js';
import { agentRegistry } from '../agents/registry.js';
import { HANDOFF_TOOL_NAME } from '../agents/tools/handoff.js';
import { writeAudit } from '../audit/log.js';
import { recordUsage, validateAgentOutput } from '../guardrails/index.js';
import { formatMemoryContext, longTermMemory } from '../memory/long-term.js';
import { formatRagContext, semanticMemory } from '../memory/semantic.js';
import { shortTermMemory } from '../memory/short-term.js';
import { createLogger } from '../observability/logger.js';
import {
  incrementCounter,
  recordCost,
  recordLatency,
} from '../observability/metrics.js';

const logger = createLogger('cortex.orchestrator');
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BrainAction,
  BrainInsight,
  TenantContext,
} from '../types.js';
import { analyze } from './analyzer.js';

/** Limite de handoffs em cadeia — evita loops infinitos entre agentes. */
const MAX_HANDOFFS = 3;

/**
 * Grava decision trace no painel (tabela decision_traces) — fire-and-forget.
 * Só quando o tenant tem workspaceId mapeado (FK em public.workspaces).
 */
function saveDecisionTrace(params: {
  workspaceId: string;
  sessionId: string;
  agentName: string;
  userQuery: string;
  finalAnswer: string | null;
  reasoning: string;
  intent: string;
  actions: BrainAction[];
  totalLatencyMs: number;
  totalTokens: number;
  status: 'resolved' | 'escalated' | 'failed';
}): void {
  if (!supabase) return;
  const steps: Array<Record<string, unknown>> = [];
  let n = 1;
  const push = (type: string, label: string, detail: string, extra?: Record<string, unknown>) =>
    steps.push({ id: `s${n}`, step: n++, type, label, detail: detail.slice(0, 500), durationMs: 0, ...extra });

  push('thought', `intent: ${params.intent}`, params.reasoning);
  for (const a of params.actions) {
    if (a.type === 'tool_call' && a.tool) {
      const p = (a.payload ?? {}) as { input?: unknown; output?: unknown; error?: string; durationMs?: number };
      push('tool_call', a.tool, JSON.stringify(p.input ?? {}), { durationMs: p.durationMs ?? 0 });
      push('tool_result', p.error ? 'erro' : 'ok', JSON.stringify(p.error ?? p.output ?? null));
    }
  }
  if (params.finalAnswer) {
    push('response', 'Resposta gerada', params.finalAnswer, { tokensUsed: params.totalTokens });
  }

  void supabase
    .from('decision_traces')
    .insert({
      workspace_id: params.workspaceId,
      conversation_id: params.sessionId,
      agent_name: params.agentName,
      user_query: params.userQuery.slice(0, 2000),
      final_answer: params.finalAnswer?.slice(0, 4000) ?? null,
      steps,
      total_latency_ms: params.totalLatencyMs,
      total_tokens: params.totalTokens,
      status: params.status,
    })
    .then(({ error }) => {
      if (error) logger.warn('saveDecisionTrace falhou', { error: error.message });
    });
}

function buildBrainContext(
  insights: BrainInsight[],
  req: AnalyzeRequest,
  memoryBlock: string,
): string {
  const parts: string[] = [];

  if (req.entity) {
    parts.push(
      `Entidade: ${req.entity.type}#${req.entity.id}${
        req.entity.displayName ? ` (${req.entity.displayName})` : ''
      }`,
    );
    if (req.entity.attrs && Object.keys(req.entity.attrs).length > 0) {
      parts.push(
        `Atributos relevantes: ${JSON.stringify(req.entity.attrs).slice(0, 400)}`,
      );
    }
  }

  if (memoryBlock) parts.push(memoryBlock);

  if (insights.length > 0) {
    parts.push(
      `Insights do Brain:\n${insights.map((i) => `- [${i.kind}] ${i.text}`).join('\n')}`,
    );
  }

  if (req.channel) parts.push(`Canal: ${req.channel}`);

  return parts.join('\n');
}

export async function orchestrate(
  tenant: TenantContext,
  req: AnalyzeRequest,
  apiKey?: string,
): Promise<AnalyzeResponse> {
  const startedAt = Date.now();
  const traceId = randomUUID();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCostUsd = 0;
  let modelUsed: string | undefined;
  let analyzerModel: string | undefined;
  let selectedAgentId: string | null = null;
  let intent = 'unknown';
  let confidence = 0;
  let reasoning = '';
  let insights: BrainInsight[] = [];
  let replyText: string | null = null;
  const actions: BrainAction[] = [];

  // ─── 1. Memória curta ────────────────────────────────────────────────────
  const session = shortTermMemory.getOrCreate(tenant.tenantId, req.sessionId, {
    entity: req.entity,
    channel: req.channel,
  });
  shortTermMemory.appendMessage(tenant.tenantId, req.sessionId, {
    role: 'user',
    content: req.input,
    meta: req.meta,
  });

  // ─── 1b. Memória longa + semântica (paralelo) ───────────────────────────
  let memoryBlock = '';
  let ragBlock = '';
  {
    const entityMemPromise = req.entity
      ? longTermMemory.getEntity(tenant.tenantId, req.entity)
      : Promise.resolve(null);
    const factsPromise = req.entity
      ? longTermMemory.listFacts(tenant.tenantId, req.entity, 10)
      : Promise.resolve([]);
    const summariesPromise = req.entity
      ? longTermMemory.listRecentSummariesForEntity(tenant.tenantId, req.entity, 3)
      : Promise.resolve([]);
    const ragPromise = semanticMemory.searchKnowledge(
      tenant.tenantId,
      req.input,
      5,
    );

    const [entityMem, facts, summaries, ragHits] = await Promise.all([
      entityMemPromise,
      factsPromise,
      summariesPromise,
      ragPromise,
    ]);
    memoryBlock = formatMemoryContext(entityMem, facts, summaries);
    ragBlock = formatRagContext(ragHits);

    if (req.entity) {
      // Touch fire-and-forget
      longTermMemory
        .touchEntity(tenant.tenantId, req.entity, 1)
        .catch((err) =>
          console.warn('[cortex.orchestrator] touchEntity falhou:', err.message),
        );
    }
  }

  // Combina memória longa + RAG num bloco único
  const combinedMemory = [memoryBlock, ragBlock].filter(Boolean).join('\n\n');

  try {
    // ─── 2. Analyzer ───────────────────────────────────────────────────────
    const analyzerOut = await analyze(req, session, apiKey);
    selectedAgentId = analyzerOut.selectedAgentId;
    intent = analyzerOut.intent;
    confidence = analyzerOut.confidence;
    reasoning = analyzerOut.reasoning;
    insights = analyzerOut.insights;
    analyzerModel = analyzerOut.model;
    totalInputTokens += analyzerOut.usage.inputTokens;
    totalOutputTokens += analyzerOut.usage.outputTokens;
    totalCacheReadTokens += analyzerOut.usage.cacheReadTokens;
    totalCostUsd += calculateCost(
      {
        inputTokens: analyzerOut.usage.inputTokens,
        outputTokens: analyzerOut.usage.outputTokens,
        cacheReadTokens: analyzerOut.usage.cacheReadTokens,
        cacheCreationTokens: 0,
      },
      analyzerOut.model,
    );

    // Hint do caller pode forçar agent
    if (req.hints?.forceAgent && agentRegistry.get(req.hints.forceAgent)) {
      selectedAgentId = req.hints.forceAgent;
    }

    // ─── 3. Resposta: direta ou via agente ────────────────────────────────
    if (selectedAgentId === null) {
      replyText = analyzerOut.directReply ?? null;
      modelUsed = analyzerOut.model;
      actions.push({
        type: 'reply',
        payload: { source: 'brain_direct' },
        riskLevel: 0,
      });
    } else {
      // Loop de handoff (até MAX_HANDOFFS) — usa executor (tool loop completo)
      let currentAgentId: string = selectedAgentId;
      let handoffContext = buildBrainContext(insights, req, combinedMemory);
      const handoffChain: string[] = [];

      for (let hop = 0; hop <= MAX_HANDOFFS; hop++) {
        const def = agentRegistry.get(currentAgentId);
        if (!def) {
          throw new Error(`agent não encontrado no registry: ${currentAgentId}`);
        }

        const agentOut = await executeAgent(def, {
          tenantId: tenant.tenantId,
          sessionId: req.sessionId,
          messages: session.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          brainContext: handoffContext,
          apiKey,
        });

        replyText = agentOut.text;
        modelUsed = def.model;
        totalInputTokens += agentOut.usage.inputTokens;
        totalOutputTokens += agentOut.usage.outputTokens;
        totalCacheReadTokens += agentOut.usage.cacheReadTokens;
        totalCostUsd += calculateCost(
          {
            inputTokens: agentOut.usage.inputTokens,
            outputTokens: agentOut.usage.outputTokens,
            cacheReadTokens: agentOut.usage.cacheReadTokens,
            cacheCreationTokens: 0,
          },
          def.model,
        );

        actions.push({
          type: 'agent_call',
          agent: def.id,
          payload: {
            intent,
            confidence,
            iterations: agentOut.iterations.length,
            hop,
          },
          riskLevel: 1,
        });

        // Registra cada tool call/result como ação no audit trail
        for (const it of agentOut.iterations) {
          for (let i = 0; i < it.toolCalls.length; i++) {
            const tc = it.toolCalls[i];
            const tr = it.toolResults[i];
            if (tc.name === HANDOFF_TOOL_NAME) continue;
            actions.push({
              type: 'tool_call',
              agent: def.id,
              tool: tc.name,
              payload: {
                input: tc.input,
                output: tr?.output,
                error: tr?.error,
                durationMs: tr?.durationMs,
              },
              riskLevel: tr?.error ? 1 : 2,
            });
          }
        }

        // Handoff detectado pelo executor
        if (agentOut.handoffRequested && hop < MAX_HANDOFFS) {
          const { targetAgentId, reason, contextSummary } = agentOut.handoffRequested;
          const targetDef = agentRegistry.get(targetAgentId);

          if (!targetDef) {
            actions.push({
              type: 'noop',
              payload: { handoff_failed: true, target: targetAgentId, reason: 'agent_not_found' },
              riskLevel: 0,
            });
            break;
          }
          if (handoffChain.includes(targetAgentId)) {
            actions.push({
              type: 'noop',
              payload: { handoff_loop_detected: true, target: targetAgentId },
              riskLevel: 0,
            });
            break;
          }
          handoffChain.push(currentAgentId);
          actions.push({
            type: 'agent_call',
            agent: targetAgentId,
            payload: { handoff_from: def.id, reason },
            riskLevel: 1,
          });
          if (tenant.workspaceId && supabase) {
            void supabase
              .from('agent_handoffs')
              .insert({
                workspace_id: tenant.workspaceId,
                conversation_id: req.sessionId,
                customer_name: req.entity?.displayName ?? req.entity?.id ?? 'desconhecido',
                from_agent_name: def.name,
                to_agent_name: targetDef.name,
                reason: reason.slice(0, 500),
                context_preserved: Boolean(contextSummary),
              })
              .then(({ error }) => {
                if (error) logger.warn('handoff log falhou', { error: error.message });
              });
          }
          handoffContext =
            `${buildBrainContext(insights, req, combinedMemory)}\n\nHANDOFF de ${def.name}:\n` +
            `Motivo: ${reason}\nResumo: ${contextSummary || '(sem resumo)'}`;
          currentAgentId = targetAgentId;
          selectedAgentId = targetAgentId;
          continue;
        }

        if (agentOut.error) {
          actions.push({
            type: 'noop',
            payload: { executor_error: agentOut.error, agent: def.id },
            riskLevel: 0,
          });
        }

        break; // sem mais handoffs → encerra loop
      }
    }

    // Guardrail Fase 3: output validation — sanitiza a resposta antes de
    // sair (PII leak mascarado, prompt leak vira mensagem neutra, truncamento)
    if (replyText && process.env.CORTEX_OUTPUT_VALIDATION !== 'false') {
      const ov = validateAgentOutput(replyText);
      if (ov.promptLeakDetected) {
        logger.warn('output validation: prompt leak detectado', {
          tenantId: tenant.tenantId,
          traceId,
          sessionId: req.sessionId,
        });
        actions.push({
          type: 'noop',
          payload: { output_blocked: true, reason: 'prompt_leak_detected' },
          riskLevel: 3,
        });
        replyText =
          'Desculpe, não posso compartilhar detalhes da minha configuração interna. Posso ajudar com mais alguma coisa?';
      } else {
        if (ov.piiMasked > 0 || ov.truncated) {
          actions.push({
            type: 'noop',
            payload: {
              output_sanitized: true,
              pii_masked: ov.piiMasked,
              truncated: ov.truncated,
            },
            riskLevel: 1,
          });
        }
        replyText = ov.text;
      }
    }

    // Anexa reply na sessão
    if (replyText) {
      shortTermMemory.appendMessage(tenant.tenantId, req.sessionId, {
        role: 'assistant',
        content: replyText,
      });
    }
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('orchestrate failed', {
      tenantId: tenant.tenantId,
      traceId,
      sessionId: req.sessionId,
      error: msg,
    });
    incrementCounter('cortex_request_errors_total', { tenant: tenant.tenantId });

    await writeAudit({
      tenantId: tenant.tenantId,
      sessionId: req.sessionId,
      traceId,
      channel: req.channel,
      entityType: req.entity?.type,
      entityId: req.entity?.id,
      inputText: req.input,
      selectedAgent: selectedAgentId,
      intent,
      confidence,
      reasoning,
      replyText: null,
      actionsCount: 0,
      insightsCount: 0,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      estimatedCostUsd: totalCostUsd,
      latencyMs: Date.now() - startedAt,
      model: analyzerModel,
      status: 'error',
      errorMessage: msg,
    });

    throw err;
  }

  const latencyMs = Date.now() - startedAt;

  // ─── Métricas ──────────────────────────────────────────────────────────
  incrementCounter('cortex_requests_total', { tenant: tenant.tenantId });
  recordLatency(latencyMs, { tenant: tenant.tenantId });
  recordCost(totalCostUsd, { tenant: tenant.tenantId });
  if (selectedAgentId) {
    incrementCounter('cortex_agent_invocations_total', {
      agent: selectedAgentId,
      tenant: tenant.tenantId,
    });
  }
  logger.info('orchestrate ok', {
    tenantId: tenant.tenantId,
    traceId,
    sessionId: req.sessionId,
    agentId: selectedAgentId ?? 'direct',
    latencyMs,
    cost: totalCostUsd,
    insights: insights.length,
    actions: actions.length,
  });

  // ─── 4. Usage tracking (fire-and-forget) ───────────────────────────────
  recordUsage(tenant.tenantId, {
    messages: 1,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    costUsd: totalCostUsd,
  }).catch((err) =>
    console.warn('[cortex.orchestrator] recordUsage falhou:', err.message),
  );

  // ─── 5. Audit log ──────────────────────────────────────────────────────
  await writeAudit({
    tenantId: tenant.tenantId,
    sessionId: req.sessionId,
    traceId,
    channel: req.channel,
    entityType: req.entity?.type,
    entityId: req.entity?.id,
    inputText: req.input,
    selectedAgent: selectedAgentId,
    intent,
    confidence,
    reasoning,
    replyText,
    actionsCount: actions.length,
    insightsCount: insights.length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    estimatedCostUsd: totalCostUsd,
    latencyMs,
    model: modelUsed,
    status: 'ok',
  });

  // ─── 6. Decision trace pro painel (fire-and-forget) ────────────────────
  if (tenant.workspaceId) {
    saveDecisionTrace({
      workspaceId: tenant.workspaceId,
      sessionId: req.sessionId,
      agentName: selectedAgentId ?? 'brain',
      userQuery: req.input,
      finalAnswer: replyText,
      reasoning,
      intent,
      actions,
      totalLatencyMs: latencyMs,
      totalTokens: totalInputTokens + totalOutputTokens,
      status: 'resolved',
    });
  }

  return {
    sessionId: req.sessionId,
    reply: replyText,
    actions,
    insights,
    nextSteps: undefined, // Fase 1 — predição de next-step
    metrics: {
      latencyMs,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      estimatedCostUsd: totalCostUsd,
      agentUsed: selectedAgentId ?? undefined,
      model: modelUsed,
    },
    traceId,
  };
}
