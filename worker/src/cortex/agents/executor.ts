/**
 * Agent Executor — tool execution loop completo.
 *
 * Diferente do `runtime.ts` (single-shot), o executor implementa o loop:
 *   1. Chama agente
 *   2. Se stopReason === 'tool_use' → executa cada tool
 *   3. Alimenta tool_result na conversa
 *   4. Re-chama agente
 *   5. Repete até stopReason === 'end_turn' ou MAX_ITER
 *
 * Tools são resolvidas em ordem:
 *   1. Tool nativa do Cortex (futuro: search_memory, schedule, etc)
 *   2. Bridge legacy: se agent tem legacyAgentIdEnvVar, delega pro dispatcher
 *      do worker (IXC, Geogrid, TexNet, internal tools)
 *   3. Tool inexistente → erro pro agente
 */

import { callLLM } from '../../llm/client.js';
import type { MessageParam, ToolDefinition } from '../../llm/types.js';
import { executeTool as legacyExecuteTool } from '../../tools/dispatcher.js';
import { db } from '../../db/index.js';
import { agentRegistry } from './registry.js';
import { buildHandoffTool, HANDOFF_TOOL_NAME } from './tools/handoff.js';
import { getToolInputSchema } from '../../agent/tool-schemas.js';
import { routeModel } from './model-router.js';
import type { AgentDefinition, AgentRunInput } from './types.js';

const DEFAULT_MAX_ITER = 5;
const TOOL_OUTPUT_MAX_CHARS = 8000;

export interface ExecutorOutput {
  agentId: string;
  /** Texto final do agente após todas iterações. */
  text: string | null;
  /** Histórico de iterações pra debug/audit. */
  iterations: Array<{
    stopReason: string;
    text: string | null;
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    toolResults: Array<{
      toolCallId: string;
      toolName: string;
      output: string;
      error?: string;
      durationMs: number;
    }>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
  /** Detecção de handoff — caller deve interromper e mudar de agente. */
  handoffRequested?: {
    targetAgentId: string;
    reason: string;
    contextSummary: string;
  };
  /** Erro fatal (estourou max_iter, falhou tool sem recovery). */
  error?: string;
}

function buildToolsForAgent(def: AgentDefinition): ToolDefinition[] {
  const tools = [...def.tools];
  if (def.autonomous) {
    const peers = agentRegistry
      .list()
      .filter((a) => a.id !== def.id)
      .map((a) => ({ id: a.id, name: a.name, description: a.description }));
    if (peers.length > 0) tools.push(buildHandoffTool(peers));
  }
  return tools;
}

function buildInitialMessages(input: AgentRunInput): MessageParam[] {
  const msgs: MessageParam[] = [];
  if (input.brainContext) {
    msgs.push({
      role: 'user',
      content: `[CONTEXTO DO CORTEX BRAIN]\n${input.brainContext}\n\n[CONVERSA]`,
    });
    msgs.push({
      role: 'assistant',
      content: 'Entendido. Vou continuar a conversa com o cliente.',
    });
  }
  for (const m of input.messages) {
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

function truncateToolOutput(s: string): string {
  return s.length > TOOL_OUTPUT_MAX_CHARS
    ? s.slice(0, TOOL_OUTPUT_MAX_CHARS) + '\n…(truncated)'
    : s;
}

/**
 * Alias de nome → schema. Alguns nomes REAIS de tool no DB divergem das chaves
 * mapeadas em tool-schemas.ts (que segue o loop legado). Sem isso, essas tools
 * caem no schema vazio e o modelo tem que adivinhar o parâmetro. Só afeta o
 * executor (v2) — NÃO altera o getToolInputSchema compartilhado com o prod.
 */
const SCHEMA_NAME_ALIAS: Record<string, string> = {
  consultar_viabilidade_completa: 'consultar_viabilidade',
  consultar_agenda_disponivel: 'consultar_agenda',
};

/**
 * Carrega tools legacy do DB pro agente (Bianca, etc).
 * Converte do schema do dispatcher pro ToolDefinition do Anthropic SDK.
 */
async function loadLegacyTools(legacyAgentId: string): Promise<ToolDefinition[]> {
  try {
    const tools = await db.tools.listByAgent(legacyAgentId);
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      // BUGFIX: antes montava input_schema vazio ({}), o que impedia o LLM de
      // saber os parâmetros de cada tool. Usa o schema hardcoded por nome,
      // resolvendo alias quando o nome real do DB diverge da chave mapeada.
      input_schema: getToolInputSchema(SCHEMA_NAME_ALIAS[t.name] ?? t.name),
    }));
  } catch (err) {
    console.warn('[cortex.executor] loadLegacyTools falhou:', (err as Error).message);
    return [];
  }
}

export async function executeAgent(
  def: AgentDefinition,
  input: AgentRunInput,
): Promise<ExecutorOutput> {
  if (input.messages.length === 0) {
    throw new Error('executeAgent: messages vazio');
  }

  const maxIter = def.maxToolIterations ?? DEFAULT_MAX_ITER;
  const legacyAgentId = def.legacyAgentIdEnvVar
    ? process.env[def.legacyAgentIdEnvVar]
    : undefined;

  // Tools: nativas + handoff + legacy (se houver bridge)
  let tools = buildToolsForAgent(def);
  if (legacyAgentId) {
    const legacyTools = await loadLegacyTools(legacyAgentId);
    // Mescla, evitando duplicar handoff (que não existe no legacy mas vamos garantir)
    const seen = new Set(tools.map((t) => t.name));
    for (const t of legacyTools) {
      if (!seen.has(t.name)) tools.push(t);
    }
  }

  const messages: MessageParam[] = buildInitialMessages(input);
  const iterations: ExecutorOutput['iterations'] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let finalText: string | null = null;
  let handoffRequested: ExecutorOutput['handoffRequested'] | undefined;

  // Roteamento de modelo por complexidade: escolhe o tier baseado na ÚLTIMA
  // mensagem role:'user' de input.messages (a mensagem atual do cliente).
  // Backward-compat: agentes sem modelTiers usam def.model exatamente como hoje.
  let selectedModel = def.model;
  if (def.modelTiers) {
    const lastUserMsg = [...input.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      selectedModel = routeModel(lastUserMsg.content, def.modelTiers);
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const response = await callLLM({
      model: selectedModel,
      systemPrompt: def.systemPrompt,
      tools,
      messages,
      apiKey: input.apiKey,
    });

    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;
    totalCacheRead += response.usage.cacheReadTokens;

    finalText = response.text;

    const turn = {
      stopReason: response.stopReason,
      text: response.text,
      toolCalls: response.toolCalls,
      toolResults: [] as ExecutorOutput['iterations'][number]['toolResults'],
    };
    iterations.push(turn);

    // Detecta handoff — sai imediato pra caller acionar próximo agente
    const handoffCall = response.toolCalls.find((tc) => tc.name === HANDOFF_TOOL_NAME);
    if (handoffCall) {
      handoffRequested = {
        targetAgentId: String(handoffCall.input.target_agent_id ?? ''),
        reason: String(handoffCall.input.reason ?? ''),
        contextSummary: String(handoffCall.input.context_summary ?? ''),
      };
      break;
    }

    // Se não há tool calls → fim
    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      break;
    }

    // Adiciona resposta do assistant ao histórico
    messages.push({
      role: 'assistant',
      content: [
        ...(response.text ? [{ type: 'text' as const, text: response.text }] : []),
        ...response.toolCalls.map((tc) => ({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      ],
    });

    // Executa tools
    const toolResultContent: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const tc of response.toolCalls) {
      if (!legacyAgentId) {
        // Sem bridge — não executamos. Devolve "not_executed" ao agente.
        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify({
            status: 'not_executed',
            reason:
              'agent sem bridge legacy. Tool registrada como ação sugerida; aprovação humana necessária.',
          }),
          is_error: false,
        });
        turn.toolResults.push({
          toolCallId: tc.id,
          toolName: tc.name,
          output: 'not_executed',
          durationMs: 0,
        });
        continue;
      }

      try {
        const result = await legacyExecuteTool(tc.id, tc.name, tc.input, legacyAgentId);
        const output = truncateToolOutput(result.output);
        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: output,
          is_error: !!result.error,
        });
        turn.toolResults.push({
          toolCallId: tc.id,
          toolName: tc.name,
          output,
          error: result.error,
          durationMs: result.durationMs,
        });
      } catch (err) {
        const msg = (err as Error).message;
        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify({ error: msg }),
          is_error: true,
        });
        turn.toolResults.push({
          toolCallId: tc.id,
          toolName: tc.name,
          output: msg,
          error: 'exception',
          durationMs: 0,
        });
      }
    }

    // Feed tool_results pro próximo turno
    messages.push({
      role: 'user',
      content: toolResultContent,
    });
  }

  return {
    agentId: def.id,
    text: finalText,
    iterations,
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
    },
    handoffRequested,
    error:
      iterations.length === maxIter &&
      iterations[iterations.length - 1]?.stopReason === 'tool_use'
        ? 'max_iterations_reached'
        : undefined,
  };
}
