/**
 * Model Router — classificador heurístico de complexidade (zero custo, sem LLM).
 *
 * Escolhe o modelo por tier baseado no texto da mensagem atual do cliente.
 * A ideia: não pagar Sonnet pra responder "oi"/"ok", e não arriscar Haiku
 * numa objeção de preço ou negociação. Tudo por regex/heurística — sem
 * chamada de LLM extra, decisão em microssegundos.
 *
 * Tiers:
 *   - trivial:  saudação / confirmação / mensagem curtíssima → modelo barato
 *   - complex:  objeção, negociação, dúvida técnica densa, irritação, texto
 *               longo → modelo forte
 *   - standard: o resto (default)
 */

export type ModelTiers = { trivial: string; standard: string; complex: string };

/** Saudações e confirmações típicas — match exato (após normalização). */
const TRIVIAL_PHRASES = new Set([
  'oi',
  'ola',
  'olá',
  'ok',
  'okay',
  'sim',
  'nao',
  'não',
  'obrigado',
  'obrigada',
  'blz',
  'beleza',
  'bom dia',
  'boa tarde',
  'boa noite',
  'valeu',
  'certo',
  'entendi',
  'perfeito',
  'ótimo',
  'otimo',
]);

/**
 * Sinais de conversa complexa: objeção comercial, negociação, dúvida técnica
 * densa, irritação, ameaça de cancelamento/jurídico. Se qualquer um casar,
 * sobe pro tier complex.
 */
const COMPLEX_SIGNALS =
  /\b(pre[çc]o|caro|desconto|concorrente|cancelar|cancelamento|reclama\w*|processo|advogad\w*|n[aã]o\s+vou|muito\s+caro|valor|reembolso|multa|preju[íi]zo|golpe|enganad\w*|absurdo)\b/i;

const LONG_TEXT_CHARS = 280;
const TRIVIAL_MAX_CHARS = 15;

/**
 * Roteia o model id baseado na complexidade heurística do texto do cliente.
 * Retorna o id do tier escolhido.
 */
export function routeModel(userText: string, tiers: ModelTiers): string {
  const raw = (userText ?? '').trim();
  const normalized = raw.toLowerCase();

  // ── complex ────────────────────────────────────────────────────────────
  // Objeção/negociação/irritação, OU texto longo, OU pergunta de "por que".
  const hasWhyQuestion = /\bpor\s*qu[eê]\b|\bporqu[eê]\b/i.test(raw) && raw.includes('?');
  if (COMPLEX_SIGNALS.test(raw) || raw.length > LONG_TEXT_CHARS || hasWhyQuestion) {
    return tiers.complex;
  }

  // ── trivial ────────────────────────────────────────────────────────────
  // Saudação/confirmação conhecida, OU mensagem curtíssima sem "?" nem números.
  if (TRIVIAL_PHRASES.has(normalized)) {
    return tiers.trivial;
  }
  if (raw.length <= TRIVIAL_MAX_CHARS && !raw.includes('?') && !/\d/.test(raw)) {
    return tiers.trivial;
  }

  // ── standard (default) ───────────────────────────────────────────────────
  return tiers.standard;
}
