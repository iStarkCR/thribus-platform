/**
 * Smoke tests do preflight — não usa framework de teste, só asserções
 * inline rodando via tsx. Roda com:
 *
 *     cd worker && npx tsx src/tools/preflight.test.ts
 *
 * Casos cobrem os incidentes reais que originaram o módulo:
 *  - Matheus6715: "Avenida padre José Holanda do Vale, 600, Maracanaú" (sem CEP) → DEVE PASSAR
 *  - Nilsiane: "Rua lima Alves Sousa Bloco 51 apartamento 8 Aracapé" → DEVE PASSAR (condomínio)
 *  - Cliente que mandou só CEP → DEVE BLOQUEAR
 *  - Cliente que mandou só "Maracanaú" → DEVE BLOQUEAR
 */

import { preflightCheck } from './preflight.js';

interface TestCase {
  name: string;
  query: string;
  shouldPass: boolean;
  notes?: string;
}

const CASES: TestCase[] = [
  // ─── Casos que DEVEM passar ──────────────────────────────────────────────
  {
    name: 'rua + número + cidade (caso Matheus6715)',
    query: 'Avenida padre José Holanda do Vale, 600, Maracanaú',
    shouldPass: true,
    notes: 'Caso real que falhou — regra antiga exigia CEP, fix relaxa pra aceitar cidade.',
  },
  {
    name: 'rua + número + CEP',
    query: 'Rua Eretides de Alencar, 1086, CEP 60135150',
    shouldPass: true,
  },
  {
    name: 'rua + número + bairro + cidade',
    query: 'Rua das Acácias, 250, Aldeota, Fortaleza',
    shouldPass: true,
  },
  {
    name: 'condomínio com bloco/apto (caso Nilsiane)',
    query: 'Rua lima Alves Sousa, Bloco 51 apartamento 8, Aracapé, 60762560',
    shouldPass: true,
    notes: 'Condomínio sempre passa — tratamento é via prompt (escala se Geogrid falhar).',
  },
  {
    name: 'condomínio só com Bloco',
    query: 'Bloco 12 Residencial Vida Nova',
    shouldPass: true,
  },
  {
    name: 'rua + número sem cidade nem CEP (ambíguo mas plausível)',
    query: 'Rua das Flores, 100',
    shouldPass: true,
    notes: 'Geogrid pode resolver com contexto; deixa passar e o prompt manda escalar se falhar.',
  },
  {
    name: 'avenida abreviada + número + cidade',
    query: 'Av. Beira Mar, 3001, Fortaleza',
    shouldPass: true,
  },

  // ─── Casos que DEVEM bloquear ─────────────────────────────────────────────
  {
    name: 'apenas CEP',
    query: '60762560',
    shouldPass: false,
    notes: 'Caso real — cliente mandou só CEP, Geogrid quebra.',
  },
  {
    name: 'apenas cidade',
    query: 'Maracanaú',
    shouldPass: false,
  },
  {
    name: 'string vazia',
    query: '',
    shouldPass: false,
  },
  {
    name: 'apenas nome de rua sem número',
    query: 'Rua Lima Alves Sousa',
    shouldPass: false,
    notes: 'Sem número — Geogrid retorna centroide do CEP, falso positivo.',
  },
  {
    name: 'apenas bairro',
    query: 'Aracapé',
    shouldPass: false,
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

console.log('─'.repeat(70));
console.log('Preflight smoke tests — consultar_viabilidade');
console.log('─'.repeat(70));

for (const tc of CASES) {
  const result = preflightCheck('consultar_viabilidade', { query: tc.query });
  const actualPassed = result.ok;
  const expected = tc.shouldPass;
  const ok = actualPassed === expected;

  const icon = ok ? '✓' : '✗';
  const status = expected ? 'passa' : 'bloqueia';
  console.log(`${icon} [${status}] ${tc.name}`);
  console.log(`    query: ${JSON.stringify(tc.query)}`);
  if (!ok) {
    console.log(`    EXPECTED: ${expected ? 'pass' : 'block'}`);
    console.log(`    GOT: ${actualPassed ? 'pass' : 'block'} (reason: ${result.reason ?? '—'})`);
    failures.push(tc.name);
    failed++;
  } else {
    passed++;
  }
  if (tc.notes) console.log(`    note: ${tc.notes}`);
}

console.log('─'.repeat(70));
console.log(`Resultado: ${passed}/${CASES.length} ok, ${failed} falhas`);
if (failed > 0) {
  console.log('Falhas:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('Tudo passou ✓');
