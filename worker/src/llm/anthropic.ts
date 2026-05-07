/**
 * Anthropic provider — usa beta.promptCaching.
 *
 * Estratégia de cache:
 *   1. System prompt — sempre cacheado
 *   2. Tools — cache na última definição
 *   3. Histórico — cache até HISTORY_CACHE_WINDOW
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  PromptCachingBetaTextBlockParam,
  PromptCachingBetaTool,
} from '@anthropic-ai/sdk/resources/beta/prompt-caching/messages.js';
import type { CallOpts, LLMResponse, MessageParam, ToolDefinition } from './types.js';

// Cache de clients por API key (evita recriar cliente a cada call)
const clientCache = new Map<string, Anthropic>();

function getClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  let c = clientCache.get(key);
  if (!c) {
    c = new Anthropic({ apiKey: key });
    clientCache.set(key, c);
  }
  return c;
}

const HISTORY_CACHE_WINDOW = 4;

function applyHistoryCache(messages: MessageParam[]): MessageParam[] {
  if (messages.length <= HISTORY_CACHE_WINDOW) return messages;

  const cutoffIdx = messages.length - HISTORY_CACHE_WINDOW - 1;

  return messages.map((msg, idx) => {
    if (idx !== cutoffIdx) return msg;

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

function buildCachedTools(defs: ToolDefinition[]): PromptCachingBetaTool[] {
  return defs.map((d, idx): PromptCachingBetaTool => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    cache_control: idx === defs.length - 1 ? { type: 'ephemeral' } : undefined,
  }));
}

export async function callAnthropic(opts: CallOpts): Promise<LLMResponse> {
  const system: PromptCachingBetaTextBlockParam[] = [
    {
      type: 'text',
      text: opts.systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const response = await getClient(opts.apiKey).beta.promptCaching.messages.create({
    model: opts.model,
    max_tokens: 1024,
    system,
    tools: buildCachedTools(opts.tools),
    messages: applyHistoryCache(opts.messages),
    ...(opts.forceTool && opts.tools.length > 0
      ? { tool_choice: { type: 'any' } as const }
      : {}),
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
