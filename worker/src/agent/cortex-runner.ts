/**
 * Cortex Runner — adaptador do motor LIVRE (cortex/agents/executor.ts) pra
 * fila do worker.
 *
 * Diferente do `runAgentLoop` (agent/loop.ts) que roda a Bianca v1 numa
 * máquina de estados, este runner roda um AgentDefinition do registry Cortex
 * (default: bianca-v2) via tool-calling genérico, sem state machine.
 *
 * É acionado SÓ pros canais listados em CORTEX_ENGINE_CHANNELS (allowlist).
 * Todo o resto continua no runAgentLoop — comportamento de produção idêntico.
 *
 * Fluxo por turno:
 *   1. Carrega agent record + workspace (mesma via do loop.ts)
 *   2. Resolve o AgentDefinition do registry (env CORTEX_ENGINE_AGENT)
 *   3. Monta histórico (db.messages) → input.messages, msg atual por último
 *   4. Monta brainContext com memória longa do cliente (entity + facts)
 *   5. executeAgent(def, input)
 *   6. Handoff → escala pra humano; senão envia out.text via crm.sendMessage
 *   7. Persiste a resposta do assistant (histórico p/ próximo turno)
 *   8. Alimenta a memória curta p/ consolidação assíncrona
 */

import * as crm from '../crm/dispatcher.js';
import { db } from '../db/index.js';
import { pickApiKey } from '../llm/keys.js';
import type { AgentJob } from '../queue/index.js';
import { agentRegistry } from '../cortex/agents/registry.js';
import { executeAgent } from '../cortex/agents/executor.js';
import type { AgentRunInput } from '../cortex/agents/types.js';
import { longTermMemory, formatMemoryContext } from '../cortex/memory/long-term.js';
import { shortTermMemory } from '../cortex/memory/short-term.js';
import type { EntityRef } from '../cortex/types.js';

const HISTORY_KEEP_TURNS = Number(process.env.HISTORY_KEEP_TURNS ?? 20);

/**
 * Monta o bloco de memória do cliente pra injetar no prompt. Best-effort:
 * qualquer falha degrada pra `undefined` (a v2 funciona sem memória).
 */
async function buildBrainContext(
  tenantId: string,
  entity: EntityRef,
): Promise<string | undefined> {
  try {
    const [entityMem, facts, summaries] = await Promise.all([
      longTermMemory.getEntity(tenantId, entity),
      longTermMemory.listFacts(tenantId, entity),
      longTermMemory.listRecentSummariesForEntity(tenantId, entity),
    ]);
    const block = formatMemoryContext(entityMem, facts, summaries);
    if (!block) return undefined;
    return `[MEMÓRIA DO CLIENTE]\n${block}`;
  } catch (err) {
    // TODO(memory): módulos de memória indisponíveis (Supabase off / migration
    // 011 não aplicada). Segue sem contexto — não derruba o atendimento.
    console.warn('[cortex-runner] buildBrainContext falhou:', (err as Error).message);
    return undefined;
  }
}

/**
 * Escala pra humano. Replica o essencial do handoffToHuman do loop.ts
 * (nota interna + escalar via crm) sem acoplar naquela função privada.
 */
async function escalate(
  job: AgentJob,
  workspace: Awaited<ReturnType<typeof db.workspaces.findById>>,
  reason: string,
  contextSummary: string,
): Promise<void> {
  const note = [
    '🤖 Bianca v2 → handoff pra humano',
    `Motivo: ${reason || '(não informado)'}`,
    contextSummary ? `Contexto: ${contextSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await crm.addInternalNote(job.channel, job.leadId, note, workspace ?? undefined);
  } catch (err) {
    console.warn('[cortex-runner] addInternalNote falhou:', (err as Error).message);
  }
  try {
    await crm.escalateToHuman(job.channel, job.leadId, workspace ?? undefined);
  } catch (err) {
    console.warn('[cortex-runner] escalateToHuman falhou:', (err as Error).message);
  }
}

export async function runCortexAgent(job: AgentJob): Promise<void> {
  const start = Date.now();
  console.log(`[cortex-runner] start agentId=${job.agentId} leadId=${job.leadId} channel=${job.channel}`);

  try {
    // 1. Agent record (mesma via do loop.ts)
    const agent = await db.agents.findById(job.agentId);
    if (!agent) throw new Error(`Agent ${job.agentId} não encontrado no banco`);

    // 2. Workspace (multi-tenant)
    const workspace = agent.workspaceId
      ? await db.workspaces.findById(agent.workspaceId).catch(() => null)
      : null;

    // 3. AgentDefinition do registry (motor livre)
    const defId = process.env.CORTEX_ENGINE_AGENT ?? 'bianca-v2';
    const def = agentRegistry.get(defId);
    if (!def) {
      console.error(`[cortex-runner] AgentDefinition "${defId}" não registrada — abortando`);
      return;
    }

    // 4. Conversa + persiste a mensagem recebida (dedup por external_id)
    const conversation = await db.conversations.findOrCreate({
      externalId: job.leadId,
      agentId: job.agentId,
      customerPhone: job.customerPhone,
      customerName: job.customerName,
    });
    await db.messages.save({
      conversationId: conversation.id,
      role: 'user',
      content: job.content,
      externalId: job.messageId,
    });

    // 5. Histórico → input.messages (últimos N turnos user/assistant).
    const dbMsgs = await db.messages.listByConversation(conversation.id);
    const history = dbMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-HISTORY_KEEP_TURNS);

    // Garante que a msg atual é a última role:'user' (findOrCreate + save acima
    // já a incluem; este guard cobre corrida/dedup que a tenha filtrado).
    const last = history[history.length - 1];
    if (!last || last.role !== 'user' || last.content !== job.content) {
      history.push({ role: 'user', content: job.content });
    }

    // 6. Memória do cliente → brainContext
    const tenantId = agent.workspaceId ?? 'default';
    const entity: EntityRef = {
      type: 'lead',
      id: job.leadId,
      displayName: job.customerName,
      attrs: { phone: job.customerPhone },
    };
    const brainContext = await buildBrainContext(tenantId, entity);

    // 7. Executa
    const apiKey = pickApiKey(def.model, workspace);
    const input: AgentRunInput = {
      tenantId,
      sessionId: job.leadId,
      messages: history,
      brainContext,
      apiKey,
    };
    const out = await executeAgent(def, input);

    // 8. Handoff pedido pelo agente → escala e encerra o turno
    if (out.handoffRequested) {
      console.log(`[cortex-runner] handoff leadId=${job.leadId} reason="${out.handoffRequested.reason}"`);
      await escalate(job, workspace, out.handoffRequested.reason, out.handoffRequested.contextSummary);
      return;
    }

    // 9. Resposta ao cliente (crm.sendMessage trata talki: e texnet:)
    if (out.text) {
      await crm.sendMessage(job.channel, job.leadId, out.text, workspace ?? undefined);

      // 10. Persiste a resposta do assistant (memória curta p/ próximo turno)
      await db.messages.save({
        conversationId: conversation.id,
        role: 'assistant',
        content: out.text,
        tokensIn: out.usage.inputTokens,
        tokensOut: out.usage.outputTokens,
        cacheHit: out.usage.cacheReadTokens > 0,
      });

      // 11. Alimenta a memória curta do Cortex pra consolidação assíncrona.
      //     O worker periódico (startConsolidationWorker) consolida a sessão
      //     em summary + facts quando ela ficar idle/estourar o limite — que é
      //     o gatilho correto (consolidar por-turno geraria custo LLM a cada
      //     mensagem + limparia a sessão). Aqui só populamos; não forçamos.
      //     TODO(consolidation): se quisermos consolidar sob demanda ao encerrar
      //     um atendimento, chamar consolidateSessionById(tenantId, job.leadId)
      //     num ponto de "fim de conversa" — hoje não há esse sinal no motor livre.
      try {
        shortTermMemory.getOrCreate(tenantId, job.leadId, { entity, channel: job.channel });
        shortTermMemory.appendMessage(tenantId, job.leadId, { role: 'user', content: job.content });
        shortTermMemory.appendMessage(tenantId, job.leadId, { role: 'assistant', content: out.text });
      } catch (err) {
        console.warn('[cortex-runner] short-term append falhou:', (err as Error).message);
      }
    } else if (out.error) {
      console.warn(`[cortex-runner] executeAgent sem texto leadId=${job.leadId} error=${out.error}`);
    }

    const durationMs = Date.now() - start;
    console.log(
      `[cortex-runner] done leadId=${job.leadId} model=${def.model} tokens=${out.usage.inputTokens + out.usage.outputTokens} ms=${durationMs}`,
    );
  } catch (err) {
    // Top-level guard: erro logado, nunca derruba a fila.
    console.error(`[cortex-runner] job failed leadId=${job.leadId}`, err);
  }
}
