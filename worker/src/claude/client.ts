/**
 * Anthropic client com prompt caching
 *
 * Usa o endpoint beta.promptCaching do SDK que tem suporte nativo
 * a cache_control nos blocos de system prompt, tools e histórico.
 *
 * Estratégia de cache:
 *   1. System prompt do agent       → imutável entre turnos → sempre cacheado
 *   2. Definições de tools          → muda só quando editadas → cacheado na última tool
 *   3. Histórico de mensagens       → os mais antigos ficam cacheados (HISTORY_CACHE_WINDOW)
 *
 * Economia típica: 70–90% do custo de tokens em conversas longas.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  PromptCachingBetaMessageParam,
  PromptCachingBetaTextBlockParam,
} from '@anthropic-ai/sdk/resources/beta/prompt-caching/messages.js';
import type { PromptCachingBetaTool } from '@anthropic-ai/sdk/resources/beta/prompt-caching/messages.js';

export type MessageParam = PromptCachingBetaMessageParam;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface ClaudeResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  text: string | null;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

// ─── Histórico: cache nos turnos mais antigos ─────────────────────────────────

const HISTORY_CACHE_WINDOW = 4; // últimas N mensagens NÃO são cacheadas

function applyHistoryCache(messages: MessageParam[]): MessageParam[] {
  if (messages.length <= HISTORY_CACHE_WINDOW) return messages;

  const cutoffIdx = messages.length - HISTORY_CACHE_WINDOW - 1;

  return messages.map((msg, idx) => {
    if (idx !== cutoffIdx) return msg;

    // Marca cache_control no último bloco de conteúdo da mensagem de corte
    if (typeof msg.content === 'string') {
      const block: PromptCachingBetaTextBlockParam = {
        type: 'text',
        text: msg.content,
        cache_control: { type: 'ephemeral' },
      };
      return { ...msg, content: [block] };
    }

    if (Array.isArray(msg.content) && msg.content.length > 0) {
      const blocks = [...msg.content];
      blocks[blocks.length - 1] = {
        ...blocks[blocks.length - 1],
        cache_control: { type: 'ephemeral' },
      } as typeof blocks[number];
      return { ...msg, content: blocks };
    }

    return msg;
  });
}

// ─── Tools com cache na última definição ──────────────────────────────────────

function buildCachedTools(defs: ToolDefinition[]): PromptCachingBetaTool[] {
  return defs.map((d, idx): PromptCachingBetaTool => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    cache_control: idx === defs.length - 1 ? { type: 'ephemeral' } : undefined,
  }));
}

// ─── Chamada principal ────────────────────────────────────────────────────────

export async function callClaude(opts: {
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  messages: MessageParam[];
}): Promise<ClaudeResponse> {
  const system: PromptCachingBetaTextBlockParam[] = [
    {
      type: 'text',
      text: opts.systemPrompt,
      cache_control: { type: 'ephemeral' }, // system prompt sempre cacheado
    },
  ];

  const response = await client.beta.promptCaching.messages.create({
    model: opts.model,
    max_tokens: 1024,
    system,
    tools: buildCachedTools(opts.tools),
    messages: applyHistoryCache(opts.messages),
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('') || null;

  const toolCalls = response.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => {
      const tu = b as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
      return { id: tu.id, name: tu.name, input: tu.input };
    });

  const usage = response.usage;

  return {
    stopReason: response.stop_reason ?? 'end_turn',
    text,
    toolCalls,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    },
  };
}
