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
import type { AgentJob } from '../queue/index.js';

const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS ?? 10);

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

function extractMessages(raw: string): string[] {
  const trimmed = raw.trim();

  // 1) JSON puro
  const direct = tryParseMessageJSON(trimmed);
  if (direct) return direct;

  // 2) Bloco markdown ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    const fenced = tryParseMessageJSON(fenceMatch[1]);
    if (fenced) return fenced;
  }

  // 3) Texto + JSON misturados — extrai JSON balanceado
  const embedded = extractBalancedJSON(trimmed);
  if (embedded) {
    const parsed = tryParseMessageJSON(embedded);
    if (parsed) return parsed;
  }

  // 4) Fallback — texto puro
  return [trimmed];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runAgentLoop(job: AgentJob): Promise<void> {
  const start = Date.now();
  console.log(`[loop] start agentId=${job.agentId} leadId=${job.leadId}`);

  // 1. Carrega configuração do agent Thribus
  const agent = await db.agents.findById(job.agentId);
  if (!agent) throw new Error(`Agent ${job.agentId} não encontrado no banco`);

  // 2. Busca lead completo no CRM (TexNet ou Talki — dispatcher decide)
  const lead = await crm.getLead(job.channel, job.leadId);

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
  const toolFailures: Record<string, number> = {}; // circuit breaker
  const MAX_TOOL_FAILURES = 3;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let cacheReadTokens = 0;
  let finalText: string | null = null;
  let exitReason: 'resolved' | 'escalated' | 'failed' = 'failed';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // Re-verifica botMode a cada iteração (humano pode assumir no meio)
    if (iter > 0) {
      const refreshed = await crm.getLead(job.channel, job.leadId);
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

      // Circuit breaker: substitui chamadas a tools que já falharam MAX vezes
      const results = await Promise.all(
        response.toolCalls.map(async (tc) => {
          const fails = toolFailures[tc.name] ?? 0;
          if (fails >= MAX_TOOL_FAILURES) {
            console.warn(`[loop] tool="${tc.name}" circuit-breaker tripped (${fails} failures) — short-circuiting`);
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
          return executeTool(tc.id, tc.name, tc.input, job.agentId);
        }),
      );

      for (const r of results) {
        toolsUsed.push(r.toolName);
        if (r.error) {
          toolFailures[r.toolName] = (toolFailures[r.toolName] ?? 0) + 1;
        }
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
        await crm.escalateToHuman(job.channel, job.leadId);
        exitReason = 'escalated';
        break;
      }

      continue;
    }

    // ── Resposta final em texto ───────────────────────────────────────────
    if (response.text) {
      finalText = response.text;

      // Verifica canal conectado antes de enviar
      const connected = await crm.isChannelConnected(job.channel);
      if (!connected) {
        console.warn(`[loop] canal ${job.channel} desconectado — não enviando`);
        exitReason = 'failed';
        break;
      }

      // Suporte a output JSON: { "mensagem": "..." } ou { "mensagens": ["...", "..."] }
      const messagesToSend = extractMessages(finalText);

      for (let i = 0; i < messagesToSend.length; i++) {
        await crm.sendMessage(job.channel, job.leadId, messagesToSend[i]);
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

  // Estorou iterações sem resposta → falha (NÃO escala automaticamente,
  // pra evitar mudar status da conversa só por loop infinito).
  // Apenas loga e marca como failed. Operador humano pode escalar manualmente
  // observando os logs.
  if (!finalText && exitReason === 'failed') {
    console.error(
      `[loop] MAX_TOOL_ITERATIONS atingido — leadId=${job.leadId} (NÃO escalando para evitar travar conversa)`,
    );
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
