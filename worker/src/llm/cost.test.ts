/**
 * Smoke tests do cálculo de custo. Sem framework — roda via tsx.
 *
 *     cd worker && npx tsx src/llm/cost.test.ts
 */

import { calculateCost } from './cost.js';

interface TestCase {
  name: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
  model: string;
  expectedUsd: number;
  /** Tolerância em USD (rounding) */
  tolerance: number;
}

const cases: TestCase[] = [
  // ─── Anthropic — Sonnet 4.5 ─────────────────────────────────────────────
  {
    name: 'Sonnet 4.5 · só input não-cacheado',
    usage: { inputTokens: 1000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    model: 'claude-sonnet-4-5-20250929',
    // 1k × $3/M = $0.003
    expectedUsd: 0.003,
    tolerance: 0.0001,
  },
  {
    name: 'Sonnet 4.5 · 100 output',
    usage: { inputTokens: 0, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
    model: 'claude-sonnet-4-5-20250929',
    // 100 × $15/M = $0.0015
    expectedUsd: 0.0015,
    tolerance: 0.0001,
  },
  {
    name: 'Sonnet 4.5 · cache_read alto',
    usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 5000 },
    model: 'claude-sonnet-4-5-20250929',
    // 100 × $3/M + 50 × $15/M + 5000 × $0.30/M = $0.0003 + $0.00075 + $0.0015 = $0.00255
    expectedUsd: 0.00255,
    tolerance: 0.0001,
  },
  {
    name: 'Sonnet 4.5 · cache_creation cobrado +25%',
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 1000, cacheReadTokens: 0 },
    model: 'claude-sonnet-4-5-20250929',
    // 1000 × $3.75/M = $0.00375
    expectedUsd: 0.00375,
    tolerance: 0.0001,
  },

  // ─── Anthropic — Haiku 4.5 ──────────────────────────────────────────────
  {
    name: 'Haiku 4.5 · turno típico Bianca',
    usage: { inputTokens: 800, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 6000 },
    model: 'claude-haiku-4-5-20251001',
    // 800 × $1/M + 200 × $5/M + 6000 × $0.10/M = $0.0008 + $0.001 + $0.0006 = $0.0024
    expectedUsd: 0.0024,
    tolerance: 0.0001,
  },

  // ─── Anthropic — Opus 4.7 (premium) ─────────────────────────────────────
  {
    name: 'Opus 4.7 · turno premium',
    usage: { inputTokens: 1000, outputTokens: 500, cacheCreationTokens: 0, cacheReadTokens: 0 },
    model: 'claude-opus-4-7',
    // 1000 × $15/M + 500 × $75/M = $0.015 + $0.0375 = $0.0525
    expectedUsd: 0.0525,
    tolerance: 0.0001,
  },

  // ─── OpenAI — gpt-4o-mini ──────────────────────────────────────────────
  // OpenAI: inputTokens INCLUI cached, descontamos pra evitar cobrança dupla.
  {
    name: 'gpt-4o-mini · 1000 input com 500 cached',
    usage: { inputTokens: 1000, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 500 },
    model: 'gpt-4o-mini',
    // realInput = 1000 - 500 = 500
    // 500 × $0.15/M + 500 × $0.075/M (50% off) + 100 × $0.60/M
    // = $0.000075 + $0.0000375 + $0.00006 = $0.0001725
    expectedUsd: 0.0001725,
    tolerance: 0.00001,
  },

  // ─── Modelo desconhecido — fallback gpt-4o-mini ────────────────────────
  {
    name: 'modelo desconhecido cai em fallback gpt-4o-mini',
    usage: { inputTokens: 1000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    model: 'modelo-inexistente',
    // 1000 × $0.15/M = $0.00015
    expectedUsd: 0.00015,
    tolerance: 0.00001,
  },

  // ─── Empty usage ────────────────────────────────────────────────────────
  {
    name: 'usage zerado',
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    model: 'claude-sonnet-4-5-20250929',
    expectedUsd: 0,
    tolerance: 0.0001,
  },
];

console.log('━'.repeat(70));
console.log('Cost calculation smoke tests');
console.log('━'.repeat(70));

let pass = 0;
let fail = 0;
for (const c of cases) {
  const actual = calculateCost(c.usage, c.model);
  const diff = Math.abs(actual - c.expectedUsd);
  const ok = diff <= c.tolerance;
  const sym = ok ? '✓' : '✗';
  console.log(`${sym} ${c.name}`);
  console.log(`    expected: $${c.expectedUsd.toFixed(6)}  actual: $${actual.toFixed(6)}  diff: $${diff.toFixed(6)}`);
  if (ok) pass++;
  else fail++;
}

console.log('━'.repeat(70));
console.log(`Resultado: ${pass}/${cases.length} ok, ${fail} falhas`);
if (fail === 0) {
  console.log('Tudo passou ✓');
} else {
  console.log('FALHA — revisar pricing');
  process.exit(1);
}
