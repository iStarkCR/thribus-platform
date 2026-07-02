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
  // ─── Anthropic (preços por 1M tokens — referência oficial /v1/models, jul/2026) ─
  'claude-fable-5':            { input: 10.00, output: 50.00, cachedInput: 1.00 },
  'claude-opus-4-8':           { input: 5.00,  output: 25.00, cachedInput: 0.50 },
  // Sonnet 5: preço cheio $3/$15 (introdutório $2/$10 até 31/ago/2026 — usamos
  // o cheio pra não subestimar custo depois da promo; ajustar se quiser exato).
  'claude-sonnet-5':           { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-haiku-4-5-20251001':{ input: 1.00,  output:  5.00, cachedInput: 0.10 },
  'claude-opus-4-7':           { input: 5.00,  output: 25.00, cachedInput: 0.50 },
  'claude-opus-4-6':           { input: 5.00,  output: 25.00, cachedInput: 0.50 },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-sonnet-4-5-20250929': { input: 3.00,  output: 15.00, cachedInput: 0.30 },

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  'gpt-5':                    { input: 1.25,  output: 10.00 },
  'gpt-5-mini':               { input: 0.25,  output:  2.00 },
  'gpt-5-nano':               { input: 0.10,  output:  0.40 },
  'gpt-4o':                   { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':              { input: 0.15,  output:  0.60 },
};

// Heurística pra split input/output dentro de `total_tokens`.
//
// IMPORTANTE: `total_tokens` no DB do worker é apenas (input_uncached + output_tokens) —
// NÃO inclui `cache_read_tokens` (vem em coluna separada). Cache_read é input cacheado
// cobrado a parte (~10% do input normal pra Anthropic).
//
// Pra Bianca/agentes conversacionais pt-BR no WhatsApp:
// - input_uncached é sempre maior (histórico crescente, msg do user)
// - output é pequeno (~50-300 tokens — resposta curta pra WhatsApp)
// - Ratio 85/15 reflete melhor que 80/20 do design original
const INPUT_RATIO = 0.85;
const OUTPUT_RATIO = 0.15;

/**
 * Estima o custo em USD de uma execução a partir dos tokens reportados pelo worker.
 *
 * Fórmula:
 *   custo = input_uncached × $input  +  cache_read × $cachedInput  +  output × $output
 *
 * Onde:
 *   - `total_tokens` (param) = input_uncached + output (NÃO inclui cache_read)
 *   - `cache_read_tokens` (param) = input cacheado, cobrado separado a $cachedInput/MTok
 *
 * Anthropic models têm `cachedInput` no PRICING (~10% do input). OpenAI não tem
 * preço diferenciado pra cache (a API faz desconto automático invisível >1024 tok),
 * então pra OpenAI tratamos cache_read como input normal (sem desconto).
 *
 * Esta função SUBESTIMA ainda em relação ao real porque NÃO contabiliza
 * `cache_creation_input_tokens` (Anthropic cobra 25% mais caro que input ao criar
 * o cache). Quando o worker passar a calcular custo exato e gravar em
 * `executions.cost_usd`, o `resolveCost` usa o valor real direto do DB.
 *
 * Erro esperado vs cobrança real: -30% a +10% (subestima se cache_creation é
 * frequente, ok caso contrário). Ordem de magnitude correta.
 */
export function estimateCost(
  totalTokens: number,
  model: AIModel | string | undefined,
  cacheReadTokens = 0,
): number {
  if ((!totalTokens || totalTokens <= 0) && (!cacheReadTokens || cacheReadTokens <= 0)) return 0;
  const price = (model && PRICING[model as AIModel]) || PRICING['gpt-4o-mini'];

  const inputUncached = Math.max(totalTokens, 0) * INPUT_RATIO;
  const output        = Math.max(totalTokens, 0) * OUTPUT_RATIO;

  // Cache_read é input cacheado, cobrado a parte. Sem cap em totalTokens — o DB
  // mostra empíricamente cache_read MAIOR que total_tokens em conversas com
  // system prompt grande (Bianca: 4.4M total vs 6.9M cache_read em 30d).
  const cachedRate = price.cachedInput ?? price.input; // OpenAI não tem cached: usa input
  const cachedCost = (Math.max(cacheReadTokens, 0) / 1_000_000) * cachedRate;

  const inputCost  = (inputUncached / 1_000_000) * price.input;
  const outputCost = (output / 1_000_000) * price.output;

  return inputCost + cachedCost + outputCost;
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
