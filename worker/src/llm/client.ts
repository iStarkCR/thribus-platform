/**
 * LLM client unificado.
 *
 * Despacha pra Anthropic ou OpenAI baseado no nome do modelo:
 *   - claude-*  → Anthropic (com prompt caching nativo)
 *   - gpt-*     → OpenAI (cache automático ≥ 1024 tokens)
 *
 * Configure as variáveis correspondentes ao(s) provider(s) que vai usar:
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 */

import { callAnthropic } from './anthropic.js';
import { callOpenAI } from './openai.js';
import type { CallOpts, LLMResponse } from './types.js';

export type { CallOpts, LLMResponse, MessageParam, ToolDefinition } from './types.js';

export async function callLLM(opts: CallOpts): Promise<LLMResponse> {
  const model = opts.model.toLowerCase();

  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) {
    const key = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        `Modelo ${opts.model} é OpenAI mas API key não está disponível (workspace nem env).`,
      );
    }
    return callOpenAI(opts);
  }

  if (model.startsWith('claude-')) {
    const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        `Modelo ${opts.model} é Anthropic mas API key não está disponível (workspace nem env).`,
      );
    }
    return callAnthropic(opts);
  }

  throw new Error(
    `Provider não detectado para modelo "${opts.model}". Use prefixo claude-* ou gpt-*.`,
  );
}
