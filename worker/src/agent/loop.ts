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
import * as crm from '../crm/client.js';
import { db } from '../db/index.js';
import type { AgentJob } from '../queue/index.js';

const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS ?? 10);

/**
 * Extrai mensagens do output do agente.
 * Suporta:
 *   - { "mensagem": "texto" } → ["texto"]
 *   - { "mensagens": ["a", "b"] } → ["a", "b"]
 *   - texto puro → [texto puro]
 *   - JSON em bloco markdown ```json ... ``` → extrai e parseia
 */
function extractMessages(raw: string): string[] {
  const trimmed = raw.trim();

  // Tenta extrair JSON de bloco markdown
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.mensagens) && parsed.mensagens.every((m: unknown) => typeof m === 'string')) {
        return parsed.mensagens;
      }
      if (typeof parsed.mensagem === 'string') {
        return [parsed.mensagem];
      }
    }
  } catch {
    // não era JSON, segue para fallback
  }

  return [trimmed];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runAgentLoop(job: AgentJob): Promise<void> {
  const start = Date.now();
  console.log(`[loop] start agentId=${job.agentId} leadId=${job.leadId}`);

  // 1. Carrega configuração do agent Thribus
  const agent = await db.agents.findById(job.agentId);
  if (!agent) throw new Error(`Agent ${job.agentId} não encontrado no banco`);

  // 2. Busca lead completo no TexNet CRM (inclui histórico)
  const lead = await crm.leads.get(job.leadId);

  // 3. Verifica se humano não assumiu enquanto job estava na fila
  if (lead.botMode === false && lead.responsibleId) {
    console.log(`[loop] lead ${job.leadId} sob controle humano — cancelando`);
    return;
  }

  // 4. Ativa botMode se não estiver ativo
  if (!lead.botMode) {
    await crm.leads.setBotMode(job.leadId, true);
    console.log(`[loop] botMode ativado para lead ${job.leadId}`);
  }

  // 5. Garante conversation no banco e persiste mensagem recebida (dedup)
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

  // 6. Monta histórico de mensagens para o Claude
  // Usa as mensagens do próprio CRM (fonte de verdade)
  const history = lead.messages ?? [];
  const messages: MessageParam[] = history
    .filter((m) => m.type === 'text')
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

  // Garante que a mensagem atual está ao final (pode já estar no histórico)
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== job.content) {
    messages.push({ role: 'user', content: job.content });
  }

  // 7. Carrega tool definitions
  const toolRecords = await db.tools.listByAgent(job.agentId);
  const toolDefs: ToolDefinition[] = toolRecords.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  }));

  // 8. Loop agêntico
  const toolsUsed: string[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let cacheReadTokens = 0;
  let finalText: string | null = null;
  let exitReason: 'resolved' | 'escalated' | 'failed' = 'failed';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // Re-verifica botMode a cada iteração (humano pode assumir no meio)
    if (iter > 0) {
      const refreshed = await crm.leads.get(job.leadId);
      if (refreshed.botMode === false) {
        console.log(`[loop] humano assumiu durante loop iter=${iter} — cancelando`);
        return;
      }
    }

    console.log(`[loop] iter=${iter} agentId=${job.agentId} leadId=${job.leadId}`);

    const response = await callLLM({
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      tools: toolDefs,
      messages,
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

      const results = await Promise.all(
        response.toolCalls.map((tc) => executeTool(tc.id, tc.name, tc.input, job.agentId)),
      );

      for (const r of results) {
        toolsUsed.push(r.toolName);
        console.log(`[loop] tool="${r.toolName}" durationMs=${r.durationMs} ${r.error ? `error=${r.error}` : 'ok'}`);
      }

      messages.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.output,
        })),
      });

      // Escalonamento via tool
      const escalation = results.find((r) => r.toolName === 'escalar_humano');
      if (escalation) {
        await crm.escalateToHuman(job.leadId, job.channel);
        exitReason = 'escalated';
        break;
      }

      continue;
    }

    // ── Resposta final em texto ───────────────────────────────────────────
    if (response.text) {
      finalText = response.text;

      // Verifica canal conectado antes de enviar
      const connected = await crm.channels.isConnected(job.channel);
      if (!connected) {
        console.warn(`[loop] canal ${job.channel} desconectado — não enviando`);
        exitReason = 'failed';
        break;
      }

      // Suporte a output JSON: { "mensagem": "..." } ou { "mensagens": ["...", "..."] }
      const messagesToSend = extractMessages(finalText);

      for (let i = 0; i < messagesToSend.length; i++) {
        await crm.messages.send(job.leadId, messagesToSend[i]);
        // Pequeno delay entre mensagens para chegar em ordem
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

      break;
    }

    console.warn(`[loop] resposta vazia iter=${iter}`);
    break;
  }

  // Estorou iterações sem resposta → escalar
  if (!finalText && exitReason === 'failed') {
    console.error(`[loop] MAX_TOOL_ITERATIONS atingido — escalando leadId=${job.leadId}`);
    await crm.escalateToHuman(job.leadId, job.channel);
    exitReason = 'escalated';
  }

  const durationMs = Date.now() - start;
  console.log(
    `[loop] done leadId=${job.leadId} status=${exitReason} tools=[${toolsUsed.join(',')}] tokens=${totalTokensIn + totalTokensOut} cacheRead=${cacheReadTokens} ms=${durationMs}`,
  );

  await db.executions.save({
    agentId: job.agentId,
    conversationId: conversation.id,
    customerPhone: job.customerPhone,
    customerName: job.customerName,
    status: exitReason,
    toolsUsed: [...new Set(toolsUsed)],
    responseTimeMs: durationMs,
    totalTokens: totalTokensIn + totalTokensOut,
    cacheReadTokens,
  });

  // Se escalou, registra na tabela escalations
  if (exitReason === 'escalated') {
    await db.escalations.create({
      agentId: job.agentId,
      conversationId: conversation.id,
      customerPhone: job.customerPhone,
      customerName: job.customerName,
      reason: 'Bot transferiu para humano',
      priority: 'medium',
    }).catch((err) => console.warn('[loop] falha ao registrar escalation', err));
  }
}
