/**
 * Cortex Router — replay offline (Fase 2).
 *
 * Valida a calibragem do perfil 'painel' SEM precisar de shadow de dias: carrega
 * as mensagens reais do painel (collaborator_messages, role='user',
 * channel='thribus'), roda route({ profile: 'painel' }) em cada uma e imprime a
 * distribuição por tier/modelo.
 *
 * CRITÉRIO DE ACEITE (projeção do Codd):
 *   ~11%  opus  (high + xhigh + max somados)
 *   ~6,7% haiku
 *   resto sonnet
 *
 * Roda em Node puro: o módulo é TS (com import de `@/lib/supabase`, que usa
 * `import.meta.env` do Vite). Pra rodar fora do bundler, transpilamos com esbuild
 * e trocamos `@/lib/supabase` por um stub vazio — `route()` não toca no Supabase.
 *
 * Uso:
 *   node scripts/cortex-router-replay.mjs            # lê env de ~/.thribus/bukowiski-bridge.env
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cortex-router-replay.mjs
 *   node scripts/cortex-router-replay.mjs --limit 1000
 */

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// ─── Env ────────────────────────────────────────────────────────────────────
// Lê ~/.thribus/bukowiski-bridge.env (linhas `export KEY=VALUE`) sem sobrescrever
// o que já vier do ambiente. Última ocorrência vence (o arquivo tem duplicatas).
function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(homedir(), '.thribus', 'bukowiski-bridge.env'));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env ou ~/.thribus/bukowiski-bridge.env).');
  process.exit(1);
}

const argLimit = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

// ─── Carrega route() do módulo TS via esbuild (stub no Supabase) ─────────────
async function loadRouter() {
  const stub = 'export const supabase = null; export const isSupabaseConfigured = false;';
  const result = await build({
    entryPoints: [path.join(SRC, 'services', 'cortex-router.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [
      {
        name: 'thribus-aliases',
        setup(b) {
          // @/lib/supabase → stub (corta a dependência de import.meta.env do Vite).
          b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
          // demais @/x → src/x
          b.onResolve({ filter: /^@\// }, (a) => ({ path: path.join(SRC, a.path.slice(2)) }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return mod.route;
}

// ─── Mensagens reais (PostgREST, paginado) ───────────────────────────────────
async function fetchMessages() {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${SUPABASE_URL}/rest/v1/collaborator_messages` +
      `?role=eq.user&channel=eq.thribus&select=content` +
      `&order=created_at.asc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    if (argLimit && all.length >= argLimit) break;
  }
  let texts = all.map((r) => (r.content || '').trim()).filter((s) => s.length > 0);
  if (argLimit) texts = texts.slice(0, argLimit);
  return texts;
}

// ─── Replay ──────────────────────────────────────────────────────────────────
function pct(n, total) {
  return total ? (100 * n) / total : 0;
}

async function main() {
  const route = await loadRouter();
  const texts = await fetchMessages();
  const total = texts.length;

  // tier → model · effort (informativo) + contadores
  const tiers = ['trivial', 'médio', 'complexo', 'crítico', 'máximo'];
  const tierMeta = {
    trivial: 'haiku',
    médio: 'sonnet',
    complexo: 'opus · high',
    crítico: 'opus · xhigh',
    máximo: 'opus · max',
  };
  const byTier = Object.fromEntries(tiers.map((t) => [t, 0]));
  const byModel = { haiku: 0, sonnet: 0, opus: 0 };

  for (const text of texts) {
    const r = route({ text, profile: 'painel' });
    byTier[r.tier] = (byTier[r.tier] || 0) + 1;
    byModel[r.model] = (byModel[r.model] || 0) + 1;
  }

  // ── Saída ──
  console.log(`\nCortex Router · replay painel — ${total} mensagens reais (collaborator_messages, user/thribus)\n`);

  console.log('Distribuição por TIER');
  console.log('─'.repeat(56));
  console.log('tier'.padEnd(10), 'modelo'.padEnd(14), 'qtd'.padStart(5), '   %');
  console.log('─'.repeat(56));
  for (const t of tiers) {
    console.log(
      t.padEnd(10),
      tierMeta[t].padEnd(14),
      String(byTier[t]).padStart(5),
      pct(byTier[t], total).toFixed(1).padStart(6) + '%',
    );
  }

  const opus = byModel.opus;
  console.log('\nDistribuição por MODELO (vs. projeção Codd)');
  console.log('─'.repeat(56));
  const rows = [
    ['haiku', byModel.haiku, 6.7],
    ['sonnet', byModel.sonnet, 82.3],
    ['opus', opus, 11.0],
  ];
  console.log('modelo'.padEnd(10), 'qtd'.padStart(5), 'real'.padStart(8), 'meta'.padStart(8), '  Δ');
  console.log('─'.repeat(56));
  let pass = true;
  const TOL = 3.0; // ±3 pontos percentuais
  for (const [m, n, meta] of rows) {
    const real = pct(n, total);
    const delta = real - meta;
    const ok = Math.abs(delta) <= TOL;
    if (!ok) pass = false;
    console.log(
      m.padEnd(10),
      String(n).padStart(5),
      (real.toFixed(1) + '%').padStart(8),
      (meta.toFixed(1) + '%').padStart(8),
      `  ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp ${ok ? '✓' : '✗'}`,
    );
  }
  console.log('─'.repeat(56));
  console.log(`\nCRITÉRIO (±${TOL}pp): ${pass ? 'PASS ✓' : 'FAIL ✗ — ajustar thresholds e re-rodar'}\n`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
