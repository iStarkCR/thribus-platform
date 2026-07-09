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

/**
 * Cache durável (1h) para os blocos ESTÁVEIS do prompt — system prompt e a
 * última definição de tools. Esses blocos são byte-idênticos entre requests,
 * então vale mantê-los quentes por 1h e sobreviver aos gaps naturais de uma
 * conversa de WhatsApp (o TTL padrão de 5min morre nesses buracos).
 *
 * Requer o beta header `extended-cache-ttl-2025-04-11` (enviado abaixo). O SDK
 * 0.30.1 ainda tipa cache_control só como `{ type: 'ephemeral' }`, então
 * estendemos o tipo localmente — o campo `ttl` é aceito pela API em runtime.
 */
type DurableCacheControl = { type: 'ephemeral'; ttl: '1h' };
const DURABLE_CACHE = { type: 'ephemeral', ttl: '1h' } as DurableCacheControl;

// Envia os dois betas juntos: prompt-caching (que o namespace beta.promptCaching
// já usa) + o TTL estendido. Passamos explícito pra não sobrescrever o header
// default do SDK ao injetar o segundo beta.
const CACHE_BETA_HEADER = 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11';

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
    cache_control:
      idx === defs.length - 1
        ? (DURABLE_CACHE as PromptCachingBetaTool['cache_control'])
        : undefined,
  }));
}

export async function callAnthropic(opts: CallOpts): Promise<LLMResponse> {
  const system: PromptCachingBetaTextBlockParam[] = [
    {
      type: 'text',
      text: opts.systemPrompt,
      cache_control: DURABLE_CACHE as PromptCachingBetaTextBlockParam['cache_control'],
    },
  ];

  const response = await getClient(opts.apiKey).beta.promptCaching.messages.create(
    {
      model: opts.model,
      max_tokens: 1024,
      system,
      tools: buildCachedTools(opts.tools),
      messages: applyHistoryCache(opts.messages),
      ...(opts.forceToolName && opts.tools.some((t) => t.name === opts.forceToolName)
        ? { tool_choice: { type: 'tool' as const, name: opts.forceToolName } }
        : opts.forceTool && opts.tools.length > 0
        ? { tool_choice: { type: 'any' as const } }
        : {}),
    },
    { headers: { 'anthropic-beta': CACHE_BETA_HEADER } },
  );

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
