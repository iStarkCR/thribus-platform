/**
 * Agent Runtime — executor de um agente registrado.
 *
 * Fase 0: chamada simples (sem loop agentic). O agente recebe contexto +
 * histórico e devolve resposta + tool calls (sem executar tools ainda).
 *
 * Fase 1: loop completo de tool_use (executar tool → feed result → re-run).
 *
 * Por que sem tools ainda? Porque na Fase 0 a Bianca rica (com tools do IXC,
 * TexNet, etc) continua rodando no agent loop legado (`agent/loop.ts`). O
 * runtime do Cortex aqui é pra Brain Q&A — análise, raciocínio, qualificação
 * de lead via API sem efeito colateral em sistema externo.
 */

import { callLLM } from '../../llm/client.js';
import type { MessageParam, ToolDefinition } from '../../llm/types.js';
import { agentRegistry } from './registry.js';
import { buildHandoffTool } from './tools/handoff.js';
import type { AgentDefinition, AgentRunInput, AgentRunOutput } from './types.js';

const MAX_TOKENS_OUTPUT = 1024;

function buildMessages(input: AgentRunInput): MessageParam[] {
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
    msgs.push({
      role: m.role,
      content: m.content,
    });
  }

  return msgs;
}

function buildToolsForAgent(def: AgentDefinition): ToolDefinition[] {
  const tools = [...def.tools];
  // Agentes autônomos ganham handoff automático
  if (def.autonomous) {
    const peers = agentRegistry
      .list()
      .filter((a) => a.id !== def.id)
      .map((a) => ({ id: a.id, name: a.name, description: a.description }));
    if (peers.length > 0) {
      tools.push(buildHandoffTool(peers));
    }
  }
  return tools;
}

export async function runAgent(
  def: AgentDefinition,
  input: AgentRunInput,
): Promise<AgentRunOutput> {
  if (input.messages.length === 0) {
    throw new Error('runAgent: messages vazio');
  }

  const response = await callLLM({
    model: def.model,
    systemPrompt: def.systemPrompt,
    tools: buildToolsForAgent(def),
    messages: buildMessages(input),
    apiKey: input.apiKey,
  });

  return {
    agentId: def.id,
    text: response.text,
    toolCalls: response.toolCalls,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheReadTokens: response.usage.cacheReadTokens,
    },
    stopReason: response.stopReason,
  };
}

/** Helper: tamanho máximo de tokens de output (pro caller saber). */
export const AGENT_MAX_OUTPUT_TOKENS = MAX_TOKENS_OUTPUT;
