/**
 * Pricing por modelo (USD por 1M tokens) — Maio 2026.
 *
 * Calculado em runtime no frontend a partir de `total_tokens` + `model` do agent
 * pra mostrar custo nas execuções sem precisar recalcular no worker (zero-risk
 * de quebrar a Bianca em produção). Quando o worker passar a gravar `cost_usd`
 * corretamente, basta usar o valor do DB; este helper é fallback.
 *
 * Fonte: documentação oficial Anthropic e OpenAI.
 */
import type { AIModel } from '@/types';

interface ModelPrice {
  input: number;          // USD por 1M tokens de entrada
  output: number;         // USD por 1M tokens de saída
  cachedInput?: number;   // Anthropic prompt cache hit — geralmente 10% do input
}

const PRICING: Record<AIModel, ModelPrice> = {
  // ─── Anthropic ─────────────────────────────────────────────────────────────
  'claude-sonnet-4-20250514': { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-haiku-4-5-20251001':{ input: 1.00,  output:  5.00, cachedInput: 0.10 },
  'claude-opus-4-6':          { input: 15.00, output: 75.00, cachedInput: 1.50 },

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  'gpt-5':                    { input: 1.25,  output: 10.00 },
  'gpt-5-mini':               { input: 0.25,  output:  2.00 },
  'gpt-5-nano':               { input: 0.10,  output:  0.40 },
  'gpt-4o':                   { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':              { input: 0.15,  output:  0.60 },
};

// Heurística: turnos típicos têm ~80% input / ~20% output.
// Em conversas com tools, o ratio fica perto disso por causa do system prompt
// que é grande e repetido (input alto) vs respostas curtas pro WhatsApp (output baixo).
const INPUT_RATIO = 0.8;
const OUTPUT_RATIO = 0.2;

/**
 * Estima o custo em USD de uma execução a partir do total de tokens e do modelo.
 *
 * - Se `cacheReadTokens` é informado e o modelo suporta cache (Anthropic),
 *   aplica desconto de 90% sobre os tokens cacheados.
 * - Quando não há ratio in/out separado, assume 80/20.
 *
 * Erro esperado: ±15% pra mais ou pra menos vs cálculo exato. Suficiente pra
 * margem operacional / dashboard.
 */
export function estimateCost(
  totalTokens: number,
  model: AIModel | string | undefined,
  cacheReadTokens = 0,
): number {
  if (!totalTokens || totalTokens <= 0) return 0;
  const price = (model && PRICING[model as AIModel]) || PRICING['gpt-4o-mini'];

  const inputTokens  = totalTokens * INPUT_RATIO;
  const outputTokens = totalTokens * OUTPUT_RATIO;

  // Cache hit: reduz custo de input em 90% pros tokens cacheados (Anthropic)
  const cachedTokens = price.cachedInput ? Math.min(cacheReadTokens, inputTokens) : 0;
  const uncachedInput = Math.max(inputTokens - cachedTokens, 0);

  const inputCost  = (uncachedInput / 1_000_000) * price.input
                   + (cachedTokens   / 1_000_000) * (price.cachedInput ?? price.input);
  const outputCost = (outputTokens / 1_000_000) * price.output;

  return inputCost + outputCost;
}

/**
 * Retorna o custo final de uma execução: usa o valor do DB se > 0, senão estima.
 * Quando o worker for atualizado pra gravar cost_usd corretamente, este helper
 * automaticamente passa a usar o valor real sem precisar trocar o código de UI.
 */
export function resolveCost(
  costUsdFromDb: number,
  totalTokens: number,
  model: AIModel | string | undefined,
  cacheReadTokens = 0,
): number {
  if (costUsdFromDb > 0) return costUsdFromDb;
  return estimateCost(totalTokens, model, cacheReadTokens);
}

/** Formata custo em USD com 4 casas decimais (típico p/ valores baixos). */
export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

/** Converte USD pra BRL aproximado (cotação ~5,00). Pra display indicativo. */
export function usdToBrl(usd: number, rate = 5.0): number {
  return usd * rate;
}
