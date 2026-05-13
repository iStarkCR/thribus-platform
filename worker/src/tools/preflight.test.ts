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
console.log(`consultar_viabilidade: ${passed}/${CASES.length} ok, ${failed} falhas`);

// ════════════════════════════════════════════════════════════════════════
// Tests do validator de DATA (consultar_agenda + criar_os_agendamento)
// ════════════════════════════════════════════════════════════════════════

interface DateCase {
  name: string;
  tool: 'consultar_agenda' | 'criar_os_agendamento';
  input: Record<string, unknown>;
  shouldPass: boolean;
  notes?: string;
}

// Calcula datas relativas ao "hoje" pra testes não-frágeis
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().slice(0, 10);
const in30days = new Date(today);
in30days.setDate(today.getDate() + 30);
const in30daysStr = in30days.toISOString().slice(0, 10);
const in120days = new Date(today);
in120days.setDate(today.getDate() + 120);
const in120daysStr = in120days.toISOString().slice(0, 10);
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const lastWeek = new Date(today);
lastWeek.setDate(today.getDate() - 7);
const lastWeekStr = lastWeek.toISOString().slice(0, 10);

const DATE_CASES: DateCase[] = [
  // ─── Devem PASSAR ───────────────────────────────────────────────────────
  { name: 'consultar_agenda · amanhã', tool: 'consultar_agenda', input: { data_desejada: tomorrowStr }, shouldPass: true },
  { name: 'consultar_agenda · hoje', tool: 'consultar_agenda', input: { data_desejada: todayStr }, shouldPass: true },
  { name: 'consultar_agenda · 30 dias à frente', tool: 'consultar_agenda', input: { data_desejada: in30daysStr }, shouldPass: true },
  { name: 'criar_os_agendamento · data válida em 30d', tool: 'criar_os_agendamento', input: { data_reservada: in30daysStr }, shouldPass: true },

  // ─── Devem BLOQUEAR ────────────────────────────────────────────────────
  {
    name: 'consultar_agenda · mês inválido (swap clássico: 2026-13-05)',
    tool: 'consultar_agenda',
    input: { data_desejada: '2026-13-05' },
    shouldPass: false,
    notes: 'Bug clássico: LLM inverte dia/mês. Validator detecta mês>12.',
  },
  {
    name: 'consultar_agenda · formato errado (13/05/2026 BR)',
    tool: 'consultar_agenda',
    input: { data_desejada: '13/05/2026' },
    shouldPass: false,
    notes: 'Tool exige ISO YYYY-MM-DD',
  },
  {
    name: 'consultar_agenda · data no passado (semana passada)',
    tool: 'consultar_agenda',
    input: { data_desejada: lastWeekStr },
    shouldPass: false,
  },
  {
    name: 'criar_os_agendamento · data > 90 dias no futuro',
    tool: 'criar_os_agendamento',
    input: { data_reservada: in120daysStr },
    shouldPass: false,
    notes: 'Reportado pelo user: agendamento indo pra novembro quando deveria ser maio (~6 meses no futuro)',
  },
  {
    name: 'consultar_agenda · data inexistente (31 de fevereiro)',
    tool: 'consultar_agenda',
    input: { data_desejada: '2026-02-31' },
    shouldPass: false,
  },
  {
    name: 'consultar_agenda · vazio',
    tool: 'consultar_agenda',
    input: { data_desejada: '' },
    shouldPass: false,
  },
];

console.log('─'.repeat(70));
console.log('Preflight smoke tests — consultar_agenda + criar_os_agendamento (data)');
console.log('─'.repeat(70));

let datePassed = 0;
let dateFailed = 0;
const dateFailures: string[] = [];

for (const tc of DATE_CASES) {
  const result = preflightCheck(tc.tool, tc.input);
  const actualPassed = result.ok;
  const ok = actualPassed === tc.shouldPass;

  const icon = ok ? '✓' : '✗';
  const status = tc.shouldPass ? 'passa' : 'bloqueia';
  console.log(`${icon} [${status}] ${tc.name}`);
  console.log(`    input: ${JSON.stringify(tc.input)}`);
  if (!ok) {
    console.log(`    EXPECTED: ${tc.shouldPass ? 'pass' : 'block'}`);
    console.log(`    GOT: ${actualPassed ? 'pass' : 'block'} (reason: ${result.reason ?? '—'})`);
    dateFailures.push(tc.name);
    dateFailed++;
  } else {
    datePassed++;
  }
  if (tc.notes) console.log(`    note: ${tc.notes}`);
}

console.log('─'.repeat(70));
console.log(`data validators: ${datePassed}/${DATE_CASES.length} ok, ${dateFailed} falhas`);

console.log('═'.repeat(70));
const totalOk = passed + datePassed;
const totalCases = CASES.length + DATE_CASES.length;
const totalFailed = failed + dateFailed;
console.log(`Resultado FINAL: ${totalOk}/${totalCases} ok, ${totalFailed} falhas`);
if (totalFailed > 0) {
  console.log('Falhas:');
  for (const f of failures) console.log(`  - [viabilidade] ${f}`);
  for (const f of dateFailures) console.log(`  - [data] ${f}`);
  process.exit(1);
}
console.log('Tudo passou ✓');
