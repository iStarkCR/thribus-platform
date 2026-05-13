/**
 * Smoke tests do parser de location (sem rede). Roda com:
 *     cd worker && npx tsx src/media/geocode.test.ts
 *
 * Não testamos reverseGeocode aqui — depende de chamada externa a Nominatim,
 * pode ser flaky em CI. Pra validar manualmente:
 *     curl 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=-3.7327&lon=-38.5267'
 */

import { parseLocationContent } from './geocode.js';

interface TestCase {
  name: string;
  input: unknown;
  expected: { lat: number; lng: number } | null;
}

const cases: TestCase[] = [
  // ─── Strings ────────────────────────────────────────────────────────────
  { name: 'string "lat,lon"',                input: '-3.7327,-38.5267',                  expected: { lat: -3.7327, lng: -38.5267 } },
  { name: 'string com espaços',              input: '  -3.7327 , -38.5267  ',           expected: { lat: -3.7327, lng: -38.5267 } },
  { name: 'string vazia',                    input: '',                                  expected: null },
  { name: 'string lixo',                     input: 'not a coordinate',                  expected: null },
  // ─── JSON strings ───────────────────────────────────────────────────────
  { name: 'JSON string com latitude/longitude', input: '{"latitude":-3.7,"longitude":-38.5}', expected: { lat: -3.7, lng: -38.5 } },
  { name: 'JSON string com lat/lng',           input: '{"lat":-3.7,"lng":-38.5}',           expected: { lat: -3.7, lng: -38.5 } },
  { name: 'JSON string com lat/lon',           input: '{"lat":-3.7,"lon":-38.5}',           expected: { lat: -3.7, lng: -38.5 } },
  // ─── Objects diretos ────────────────────────────────────────────────────
  { name: 'objeto {latitude, longitude}',    input: { latitude: -3.7, longitude: -38.5 }, expected: { lat: -3.7, lng: -38.5 } },
  { name: 'objeto {lat, lng}',               input: { lat: -3.7, lng: -38.5 },            expected: { lat: -3.7, lng: -38.5 } },
  // ─── Edge cases ─────────────────────────────────────────────────────────
  { name: 'objeto sem campos',               input: { foo: 'bar' },                      expected: null },
  { name: 'NaN no input',                    input: { lat: 'abc', lng: -38.5 },         expected: null },
  { name: 'null',                            input: null,                                expected: null },
  { name: 'undefined',                       input: undefined,                           expected: null },
  // ─── Hemisfério positivo (sanity) ──────────────────────────────────────
  { name: 'coords positivas',                input: '40.7128,-74.0060',                  expected: { lat: 40.7128, lng: -74.0060 } },
];

console.log('━'.repeat(70));
console.log('geocode.parseLocationContent tests');
console.log('━'.repeat(70));

let pass = 0;
let fail = 0;
for (const c of cases) {
  const actual = parseLocationContent(c.input);
  const ok = (actual === null && c.expected === null) ||
             (actual !== null && c.expected !== null &&
              Math.abs(actual.lat - c.expected.lat) < 0.0001 &&
              Math.abs(actual.lng - c.expected.lng) < 0.0001);
  const sym = ok ? '✓' : '✗';
  console.log(`${sym} ${c.name}`);
  if (!ok) {
    console.log(`   expected: ${JSON.stringify(c.expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
    fail++;
  } else {
    pass++;
  }
}

console.log('━'.repeat(70));
console.log(`Resultado: ${pass}/${cases.length} ok, ${fail} falhas`);
if (fail > 0) {
  console.log('FALHA');
  process.exit(1);
} else {
  console.log('Tudo passou ✓');
}
