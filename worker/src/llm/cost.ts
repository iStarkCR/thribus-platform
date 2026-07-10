/**
 * Cálculo EXATO de custo por execução — usado pelo agent loop pra gravar
 * `executions.cost_usd` no DB.
 *
 * Difere de `src/lib/pricing.ts` (frontend) que ESTIMA via heurística 85/15
 * input/output. Este módulo recebe os tokens REAIS reportados pelo provider
 * (4 categorias separadas) e calcula com pricing por categoria.
 *
 * Anthropic API retorna 4 valores separados em `usage`:
 *   - input_tokens                  (não-cacheado, "novo" — cobrado a price.input)
 *   - cache_creation_input_tokens   (criando cache — Anthropic cobra +25% sobre input)
 *   - cache_read_input_tokens       (lendo do cache — Anthropic dá -90% sobre input)
 *   - output_tokens                 (cobrado a price.output)
 *
 * OpenAI API:
 *   - prompt_tokens                 (total — JÁ inclui cached)
 *   - prompt_tokens_details.cached_tokens (subset cached — OpenAI cobra -50%)
 *   - completion_tokens
 *   (sem cache_creation explícito)
 *
 * Quando o `model` não tá no PRICING, cai em gpt-4o-mini como fallback (barato,
 * evita over-charge se tiver bug de pricing missing — pior caso é under-estimate).
 */

import type { LLMResponse } from './types.js';

interface ModelPrice {
  /** USD por 1M tokens — input não-cacheado (preço base) */
  input: number;
  /** USD por 1M tokens — output */
  output: number;
  /** USD por 1M tokens — leitura de cache */
  cacheRead: number;
  /** USD por 1M tokens — criação de cache (Anthropic). Se omitido, usa price.input. */
  cacheCreation?: number;
  /**
   * Se true, o `inputTokens` do provider JÁ INCLUI os tokens cacheados (OpenAI faz isso).
   * Pra não cobrar dobrado, descontamos `cacheReadTokens` de `inputTokens` antes
   * de aplicar o preço de input.
   */
  cachedIncludedInInput: boolean;
}

/**
 * Pricing oficial em USD por 1M tokens — Maio 2026.
 * Manter em sincronia com src/lib/pricing.ts (frontend) e cost.ts (worker).
 */
const PRICING: Record<string, ModelPrice> = {
  // ─── Anthropic — input_tokens NÃO inclui cached ──────────────────────────
  // ── Atuais (jul/2026) ──
  'claude-fable-5': {
    input: 10.00, output: 50.00,
    cacheRead: 1.00, cacheCreation: 12.50,
    cachedIncludedInInput: false,
  },
  'claude-opus-4-8': {
    input: 5.00, output: 25.00,
    cacheRead: 0.50, cacheCreation: 6.25,
    cachedIncludedInInput: false,
  },
  'claude-sonnet-5': {
    input: 3.00, output: 15.00,
    cacheRead: 0.30, cacheCreation: 3.75,
    cachedIncludedInInput: false,
  },
  'claude-haiku-4-5-20251001': {
    input: 1.00, output: 5.00,
    cacheRead: 0.10, cacheCreation: 1.25,
    cachedIncludedInInput: false,
  },
  // ── Legacy (mantidos p/ compat de agentes já gravados) ──
  'claude-opus-4-7': {
    input: 15.00, output: 75.00,
    cacheRead: 1.50, cacheCreation: 18.75,
    cachedIncludedInInput: false,
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.00, output: 15.00,
    cacheRead: 0.30, cacheCreation: 3.75,
    cachedIncludedInInput: false,
  },
  // ─── OpenAI — prompt_tokens INCLUI cached ────────────────────────────────
  // OpenAI cobra cache_read a 50% do input (vs 90% off da Anthropic).
  'gpt-5':       { input: 1.25, output: 10.00, cacheRead: 0.625, cachedIncludedInInput: true },
  'gpt-5-mini':  { input: 0.25, output:  2.00, cacheRead: 0.125, cachedIncludedInInput: true },
  'gpt-5-nano':  { input: 0.10, output:  0.40, cacheRead: 0.05,  cachedIncludedInInput: true },
  'gpt-4o':      { input: 2.50, output: 10.00, cacheRead: 1.25,  cachedIncludedInInput: true },
  'gpt-4o-mini': { input: 0.15, output:  0.60, cacheRead: 0.075, cachedIncludedInInput: true },
};

const FALLBACK_MODEL = 'gpt-4o-mini';
const TOKENS_PER_M = 1_000_000;

/**
 * Calcula o custo exato em USD de uma resposta LLM.
 * Usa as 4 categorias de tokens separadas + pricing diferenciado por categoria.
 *
 * Em caso de modelo desconhecido (não está em PRICING), usa fallback barato
 * (gpt-4o-mini). Loga warning pra futuro debug.
 */
export function calculateCost(usage: LLMResponse['usage'], model: string): number {
  const price = PRICING[model] ?? PRICING[FALLBACK_MODEL];
  if (!PRICING[model]) {
    console.warn(`[cost] modelo "${model}" sem pricing — usando fallback ${FALLBACK_MODEL}. Adicione em worker/src/llm/cost.ts.`);
  }

  // Anthropic: inputTokens já é "novo" (sem cached). Soma direto.
  // OpenAI: inputTokens INCLUI cached — desconta pra não cobrar dobrado.
  const realInput = price.cachedIncludedInInput
    ? Math.max(usage.inputTokens - usage.cacheReadTokens, 0)
    : usage.inputTokens;

  const inputCost     = (realInput                  / TOKENS_PER_M) * price.input;
  const outputCost    = (usage.outputTokens         / TOKENS_PER_M) * price.output;
  const cacheReadCost = (usage.cacheReadTokens      / TOKENS_PER_M) * price.cacheRead;
  const cacheCreCost  = (usage.cacheCreationTokens  / TOKENS_PER_M) * (price.cacheCreation ?? price.input);

  return inputCost + outputCost + cacheReadCost + cacheCreCost;
}

/**
 * Soma cumulativa de custo ao longo de múltiplos turnos (usado pelo loop
 * agêntico que pode rodar várias chamadas LLM por execução).
 */
export function accumulateCost(prev: number, usage: LLMResponse['usage'], model: string): number {
  return prev + calculateCost(usage, model);
}

// ─── Custo de ÁUDIO + EMBEDDINGS (não-chat) ──────────────────────────────────
// Hoje NÃO entram no executions.cost_usd (só modelos de chat entram). Estas
// funções calculam o custo dessas chamadas pra dar VISIBILIDADE (log estruturado
// `[aux-cost]`). Pricing OpenAI aproximado — confira no dashboard. gpt-4o-mini-tts
// é cobrado por token de áudio; usamos estimativa por caractere (~= tts-1).
const AUX_PRICING: Record<string, { perMChars?: number; perMTokens?: number; perMinute?: number }> = {
  'whisper-1':              { perMinute: 0.006 },
  'tts-1':                  { perMChars: 15 },
  'tts-1-hd':               { perMChars: 30 },
  'gpt-4o-mini-tts':        { perMChars: 15 }, // estimativa (cobrado por token de áudio)
  'text-embedding-3-small': { perMTokens: 0.02 },
  'text-embedding-3-large': { perMTokens: 0.13 },
};

/** Custo USD de uma síntese de voz (TTS) — por caractere de entrada. */
export function ttsCostUsd(model: string, chars: number): number {
  const p = AUX_PRICING[model];
  return p?.perMChars ? (Math.max(0, chars) / TOKENS_PER_M) * p.perMChars : 0;
}
/** Custo USD de uma transcrição (Whisper) — por minuto de áudio. */
export function whisperCostUsd(audioSeconds: number): number {
  return (Math.max(0, audioSeconds) / 60) * (AUX_PRICING['whisper-1'].perMinute ?? 0.006);
}
/** Custo USD de um embedding — por token. */
export function embeddingCostUsd(model: string, tokens: number): number {
  const p = AUX_PRICING[model];
  return p?.perMTokens ? (Math.max(0, tokens) / TOKENS_PER_M) * p.perMTokens : 0;
}
/** Loga custo de voz/embeddings de forma estruturada e greppável: `[aux-cost] ...`. */
export function logAuxCost(
  kind: 'tts' | 'whisper' | 'embedding',
  model: string,
  costUsd: number,
  meta: Record<string, string | number> = {},
): void {
  const extra = Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`[aux-cost] kind=${kind} model=${model} costUsd=${costUsd.toFixed(6)} ${extra}`.trimEnd());
}
