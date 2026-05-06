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
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        `Modelo ${opts.model} é OpenAI mas OPENAI_API_KEY não está definido no worker.`,
      );
    }
    return callOpenAI(opts);
  }

  if (model.startsWith('claude-')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        `Modelo ${opts.model} é Anthropic mas ANTHROPIC_API_KEY não está definido no worker.`,
      );
    }
    return callAnthropic(opts);
  }

  throw new Error(
    `Provider não detectado para modelo "${opts.model}". Use prefixo claude-* ou gpt-*.`,
  );
}
