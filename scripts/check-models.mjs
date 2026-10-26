#!/usr/bin/env node
/**
 * check-models.mjs — Detector SEMI-automático de drift da lista de modelos.
 *
 * PROBLEMA QUE RESOLVE
 * --------------------
 * `src/lib/models.ts` é a fonte única de verdade dos modelos no painel (IDs +
 * metadados CURADOS: label, badge, provider, verified). A API do provedor NÃO
 * fornece esses metadados, então a lista é mantida à mão — e fica defasada
 * (última verificação manual: mai/2026). Por outro lado, um ID inválido na
 * lista quebra o worker em runtime com 404 (foi o que derrubou a Bianca com
 * `claude-sonnet-4-20250514`).
 *
 * Este script NÃO edita models.ts. Ele só LÊ a lista, consulta a API dos
 * provedores e reporta um DIFF (modelos novos a avaliar / modelos sumidos da
 * API a deprecar). O humano cura o metadado e abre o PR manual.
 *
 * O QUE FAZ
 * ---------
 *  1. GET https://api.anthropic.com/v1/models  (lista oficial de modelos).
 *  2. (stub, desligado por padrão) GET https://api.openai.com/v1/models.
 *  3. Parseia os IDs de MODEL_OPTIONS em src/lib/models.ts e os preços em
 *     src/lib/pricing.ts.
 *  4. Compara por provedor e produz:
 *       - NOVOS  : na API, ausentes no painel  → candidatos a ADICIONAR.
 *       - SUMIDOS: no painel, ausentes da API  → candidatos a DEPRECAR (404!).
 *       - SEM PRICING: no painel mas sem entrada em pricing.ts.
 *  5. Imprime relatório legível no stdout e grava scripts/models-diff.json.
 *     Com --ci, sai com código ≠0 quando há diff relevante (dispara alerta).
 *
 * CREDENCIAL (nunca hardcode / nunca logar)
 * -----------------------------------------
 * Ordem de resolução da auth da Anthropic:
 *   1. $ANTHROPIC_API_KEY            → header `x-api-key` (forma canônica).
 *   2. $ANTHROPIC_AUTH_TOKEN         → header `Authorization: Bearer`.
 *   3. $CLAUDE_CODE_OAUTH_TOKEN      → header `Authorization: Bearer` (OAuth
 *                                      do Claude Code; funciona em /v1/models).
 * Fonte local conhecida da OAuth token (NÃO commitar, NÃO ecoar):
 *   ~/.thribus/bukowiski-bridge.env  (var CLAUDE_CODE_OAUTH_TOKEN)
 *   → rode:  source ~/.thribus/bukowiski-bridge.env && node scripts/check-models.mjs
 * OpenAI (stub): $OPENAI_API_KEY + flag --openai.
 *
 * COMO AGENDAR (semanal)
 * ----------------------
 * cron (segunda 09:00 BRT):
 *   0 12 * * 1  cd /path/thribus-platform && \
 *     ANTHROPIC_API_KEY=... node scripts/check-models.mjs --ci >> /var/log/check-models.log 2>&1 || \
 *     <dispara alerta: Talki/Slack/email pro canal #dev>
 * ou GitHub Action semanal (schedule cron) que roda com secret ANTHROPIC_API_KEY
 * e, no exit≠0, abre/atualiza um issue com o conteúdo de models-diff.json.
 *
 * COMO VIRAR PR MANUAL
 * --------------------
 * 1. Rode o script, leia o relatório / models-diff.json.
 * 2. Pra cada NOVO: decida se entra, escolha label+badge+verified, e adicione
 *    em src/lib/models.ts, src/types/index.ts (union AIModel) e src/lib/pricing.ts.
 * 3. Pra cada SUMIDO: confirme se agentes gravados ainda usam o ID antes de
 *    remover (senão o select cai no default e regrava — ver safeModel()).
 * 4. Commit + PR draft. O script nunca faz isso sozinho.
 *
 * USO
 * ---
 *   node scripts/check-models.mjs              # relatório, exit 0 sempre
 *   node scripts/check-models.mjs --ci         # exit 1 se houver diff
 *   node scripts/check-models.mjs --openai     # inclui OpenAI (precisa OPENAI_API_KEY)
 *   node scripts/check-models.mjs --json-only  # só escreve o json, stdout mínimo
 *
 * Requer Node 18+ (fetch nativo). Sem dependências externas.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MODELS_TS = resolve(ROOT, 'src/lib/models.ts');
const PRICING_TS = resolve(ROOT, 'src/lib/pricing.ts');
const OUT_JSON = resolve(__dirname, 'models-diff.json');

const ANTHROPIC_VERSION = '2023-06-01';
const argv = new Set(process.argv.slice(2));
const CI = argv.has('--ci');
const WITH_OPENAI = argv.has('--openai');
const JSON_ONLY = argv.has('--json-only');

const log = (...a) => { if (!JSON_ONLY) console.log(...a); };

/** Mascara qualquer segredo pra logs: mostra só o prefixo curto. */
function maskSecret(s) {
  if (!s) return '(ausente)';
  return `${s.slice(0, 10)}…[${s.length} chars, MASKED]`;
}

/** Resolve a auth da Anthropic sem nunca ecoar o valor. */
function resolveAnthropicAuth() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { kind: 'x-api-key', token: process.env.ANTHROPIC_API_KEY, headerName: 'x-api-key' };
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    return { kind: 'bearer', token: process.env.ANTHROPIC_AUTH_TOKEN, headerName: 'Authorization' };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { kind: 'bearer-oauth', token: process.env.CLAUDE_CODE_OAUTH_TOKEN, headerName: 'Authorization' };
  }
  return null;
}

/** Parseia MODEL_OPTIONS em models.ts → [{ id, provider }]. Regex, não import (TS). */
function parsePanelModels() {
  const src = readFileSync(MODELS_TS, 'utf8');
  const start = src.indexOf('MODEL_OPTIONS');
  const body = start >= 0 ? src.slice(start) : src;
  // id vem sempre antes de provider em cada option (multiline e single-line).
  const re = /id:\s*'([^']+)'[\s\S]*?provider:\s*'(anthropic|openai)'/g;
  const out = [];
  let m;
  while ((m = re.exec(body)) !== null) out.push({ id: m[1], provider: m[2] });
  return out;
}

/** Parseia as chaves de PRICING em pricing.ts → Set<id>. */
function parsePricedIds() {
  let src;
  try { src = readFileSync(PRICING_TS, 'utf8'); } catch { return new Set(); }
  const start = src.indexOf('const PRICING');
  const body = start >= 0 ? src.slice(start) : src;
  const re = /'([^']+)'\s*:\s*\{\s*input:/g;
  const out = new Set();
  let m;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return out;
}

async function fetchAnthropicModels(auth) {
  const headers = { 'anthropic-version': ANTHROPIC_VERSION };
  if (auth.headerName === 'x-api-key') headers['x-api-key'] = auth.token;
  else headers['Authorization'] = `Bearer ${auth.token}`;

  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic /v1/models HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.data || []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    created_at: m.created_at,
  }));
}

// STUB — desligado por padrão. Estrutura pronta pra habilitar OpenAI.
async function fetchOpenAIModels() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY ausente — não dá pra consultar OpenAI.');
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenAI /v1/models HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  // OpenAI retorna MUITO modelo (embeddings, tts, whisper, ...). Filtra só chat GPT.
  return (json.data || [])
    .map((m) => ({ id: m.id, created_at: m.created ? new Date(m.created * 1000).toISOString() : null }))
    .filter((m) => /^gpt-/.test(m.id));
}

function diffProvider(apiIds, panelIds) {
  const apiSet = new Set(apiIds);
  const panelSet = new Set(panelIds);
  const novos = apiIds.filter((id) => !panelSet.has(id));
  const sumidos = panelIds.filter((id) => !apiSet.has(id));
  return { novos, sumidos };
}

async function main() {
  const panel = parsePanelModels();
  const priced = parsePricedIds();
  const panelByProvider = {
    anthropic: panel.filter((p) => p.provider === 'anthropic').map((p) => p.id),
    openai: panel.filter((p) => p.provider === 'openai').map((p) => p.id),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    providers: {},
    hasDiff: false,
    errors: [],
  };

  log('═══════════════════════════════════════════════════════════');
  log(' check-models — drift da lista de modelos (semi-automático)');
  log(` ${report.generatedAt}`);
  log('═══════════════════════════════════════════════════════════\n');

  // ── Anthropic ──────────────────────────────────────────────────────────
  const auth = resolveAnthropicAuth();
  if (!auth) {
    const msg =
      'ANTHROPIC: sem credencial. Defina ANTHROPIC_API_KEY (x-api-key) ou ' +
      'ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN (Bearer). ' +
      'Ex: source ~/.thribus/bukowiski-bridge.env && node scripts/check-models.mjs';
    report.errors.push(msg);
    log(`⚠️  ${msg}\n`);
  } else {
    log(`Anthropic auth: ${auth.kind} via header ${auth.headerName} (${maskSecret(auth.token)})`);
    try {
      const apiModels = await fetchAnthropicModels(auth);
      const apiIds = apiModels.map((m) => m.id);
      const { novos, sumidos } = diffProvider(apiIds, panelByProvider.anthropic);
      const semPricing = apiIds.filter((id) => panelByProvider.anthropic.includes(id) && !priced.has(id));
      report.providers.anthropic = {
        apiCount: apiIds.length,
        panelCount: panelByProvider.anthropic.length,
        novos,
        sumidos,
        novosDetalhe: apiModels.filter((m) => novos.includes(m.id)),
        semPricing,
      };
      if (novos.length || sumidos.length) report.hasDiff = true;

      log(`\n── ANTHROPIC ── (API: ${apiIds.length} | painel: ${panelByProvider.anthropic.length})`);
      printProvider(novos, sumidos, report.providers.anthropic.novosDetalhe, priced);
    } catch (err) {
      report.errors.push(`anthropic: ${err.message}`);
      log(`❌ Anthropic: ${err.message}`);
    }
  }

  // ── OpenAI (stub) ──────────────────────────────────────────────────────
  if (WITH_OPENAI) {
    try {
      const apiModels = await fetchOpenAIModels();
      const apiIds = apiModels.map((m) => m.id);
      const { novos, sumidos } = diffProvider(apiIds, panelByProvider.openai);
      report.providers.openai = {
        apiCount: apiIds.length,
        panelCount: panelByProvider.openai.length,
        novos,
        sumidos,
        novosDetalhe: apiModels.filter((m) => novos.includes(m.id)),
      };
      if (novos.length || sumidos.length) report.hasDiff = true;
      log(`\n── OPENAI ── (API gpt-*: ${apiIds.length} | painel: ${panelByProvider.openai.length})`);
      printProvider(novos, sumidos, report.providers.openai.novosDetalhe, priced);
    } catch (err) {
      report.errors.push(`openai: ${err.message}`);
      log(`❌ OpenAI: ${err.message}`);
    }
  } else {
    log('\n── OPENAI ── (desligado; use --openai + OPENAI_API_KEY pra habilitar)');
  }

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  log(`\n📄 Diff gravado em ${OUT_JSON}`);

  if (JSON_ONLY) console.log(JSON.stringify(report, null, 2));

  log('\n───────────────────────────────────────────────────────────');
  if (report.hasDiff) {
    log('RESULTADO: HÁ DIFF. Revise, cure os metadados e abra PR manual.');
  } else if (report.errors.length) {
    log('RESULTADO: inconclusivo (erros acima). Nenhum diff confirmado.');
  } else {
    log('RESULTADO: lista em dia. Nada a fazer.');
  }

  if (CI && report.hasDiff) process.exit(1);
  if (CI && report.errors.length && !report.providers.anthropic) process.exit(2);
}

function printProvider(novos, sumidos, novosDetalhe, priced) {
  if (novos.length) {
    log(`\n  🆕 NOVOS na API, ausentes no painel (candidatos a ADICIONAR):`);
    for (const d of novosDetalhe) {
      const faltaPricing = !priced.has(d.id) ? '  ⚠️ sem pricing' : '';
      log(`     + ${d.id}  ${d.display_name ? `(${d.display_name})` : ''} ${d.created_at || ''}${faltaPricing}`);
    }
  } else {
    log('\n  ✅ Nenhum modelo novo.');
  }
  if (sumidos.length) {
    log(`\n  🚨 NO PAINEL mas SUMIDOS da API (risco de 404 no worker — DEPRECAR?):`);
    for (const id of sumidos) log(`     - ${id}`);
  } else {
    log('  ✅ Nenhum modelo do painel sumiu da API.');
  }
}

main().catch((err) => {
  console.error('Falha inesperada:', err);
  process.exit(3);
});
