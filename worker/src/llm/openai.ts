/**
 * OpenAI provider — Chat Completions API.
 *
 * Caching: OpenAI tem cache automático para inputs >1024 tokens
 * (não exposto via API explícita). Reportamos cached_tokens em
 * cacheReadTokens quando disponível.
 *
 * Tradução de formato:
 *   - Anthropic system field → primeira mensagem com role 'system'
 *   - Anthropic assistant tool_use blocks → OpenAI tool_calls
 *   - Anthropic user tool_result blocks → mensagens role 'tool'
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type { CallOpts, LLMResponse, MessageParam, ToolDefinition } from './types.js';

// Cache de clients por API key
const clientCache = new Map<string, OpenAI>();

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY ?? '';
  let c = clientCache.get(key);
  if (!c) {
    c = new OpenAI({ apiKey: key });
    clientCache.set(key, c);
  }
  return c;
}

// ─── Conversão de tools ───────────────────────────────────────────────────────

function buildOpenAITools(defs: ToolDefinition[]): ChatCompletionTool[] {
  return defs.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: d.input_schema,
    },
  }));
}

// ─── Conversão de mensagens (Anthropic → OpenAI) ──────────────────────────────

function toOpenAIMessages(
  systemPrompt: string,
  anthMessages: MessageParam[],
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of anthMessages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      const textParts: string[] = [];
      const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

      for (const block of msg.content) {
        if (block.type === 'text' && 'text' in block) {
          textParts.push(block.text);
        } else if (block.type === 'tool_use' && 'id' in block && 'name' in block) {
          const tu = block as { id: string; name: string; input: unknown };
          toolCalls.push({
            id: tu.id,
            type: 'function',
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input ?? {}),
            },
          });
        }
      }

      const text = textParts.join('');
      if (toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        });
      } else {
        result.push({ role: 'assistant', content: text });
      }
      continue;
    }

    if (msg.role === 'user') {
      // Pode conter tool_result blocks (resultado de tools chamadas) ou texto.
      const textParts: string[] = [];

      for (const block of msg.content) {
        if (block.type === 'tool_result' && 'tool_use_id' in block) {
          const tr = block as { tool_use_id: string; content?: unknown };
          const content =
            typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '');
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content,
          });
        } else if (block.type === 'text' && 'text' in block) {
          textParts.push(block.text);
        }
      }

      if (textParts.length > 0) {
        result.push({ role: 'user', content: textParts.join('') });
      }
    }
  }

  return result;
}

// ─── Mapeamento de stop_reason ────────────────────────────────────────────────

function mapStopReason(finishReason: string | null | undefined): string {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return finishReason ?? 'end_turn';
  }
}

// ─── Chamada principal ────────────────────────────────────────────────────────

export async function callOpenAI(opts: CallOpts): Promise<LLMResponse> {
  const messages = toOpenAIMessages(opts.systemPrompt, opts.messages);

  const response = await getClient(opts.apiKey).chat.completions.create({
    model: opts.model,
    max_tokens: 1024,
    messages,
    tools: opts.tools.length > 0 ? buildOpenAITools(opts.tools) : undefined,
    ...(opts.forceTool && opts.tools.length > 0 ? { tool_choice: 'required' as const } : {}),
  });

  const choice = response.choices[0];
  const message = choice.message;

  const text = message.content || null;

  const toolCalls = (message.tool_calls ?? []).map((tc) => {
    const fn = (tc as { function?: { name?: string; arguments?: string } }).function;
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = fn?.arguments ? JSON.parse(fn.arguments) : {};
    } catch {
      // arguments mal-formado: passa como objeto vazio
    }
    return {
      id: tc.id,
      name: fn?.name ?? '',
      input: parsedInput,
    };
  });

  const usage = response.usage;
  const cachedTokens =
    (usage as unknown as { prompt_tokens_details?: { cached_tokens?: number } })
      ?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    stopReason: mapStopReason(choice.finish_reason),
    text,
    toolCalls,
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cacheCreationTokens: 0, // OpenAI não expõe explicitamente
      cacheReadTokens: cachedTokens,
    },
  };
}
