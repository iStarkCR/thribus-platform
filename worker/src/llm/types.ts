/**
 * Tipos compartilhados pelos providers (Anthropic e OpenAI).
 *
 * O agent loop fala uma linguagem só (estes tipos). Cada provider
 * traduz pra/do seu formato nativo internamente.
 */

import type {
  PromptCachingBetaMessageParam,
} from '@anthropic-ai/sdk/resources/beta/prompt-caching/messages.js';

/** Mantemos a estrutura de mensagens da Anthropic como representação interna. */
export type MessageParam = PromptCachingBetaMessageParam;

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface LLMResponse {
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

export interface CallOpts {
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  messages: MessageParam[];
}
