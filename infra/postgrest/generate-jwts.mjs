#!/usr/bin/env node
/**
 * Gera JWTs estáticos pra PostgREST self-hosted.
 *
 * Compatível com o formato Supabase: HS256 + claims `role`, `iss`, `iat`, `exp`.
 *
 * Uso:
 *
 *   # Gera secret aleatório novo + 2 JWTs (anon + service_role)
 *   node infra/postgrest/generate-jwts.mjs
 *
 *   # Reutiliza secret existente (ex: pra rodar duas vezes e dar mesma chave)
 *   PG_JWT_SECRET=<secret-de-32+-chars> node infra/postgrest/generate-jwts.mjs
 *
 * Salve a saída em local seguro (gerenciador de senhas) — depois cole no
 * Coolify como env vars do PostgREST e do painel/worker.
 *
 * Não tem deps externas — usa só `crypto` do Node.
 */

import crypto from 'node:crypto';

// Validade dos tokens — 100 anos (padrão Supabase pra anon/service)
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 100;

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateSecret() {
  // 32 bytes = 256 bits → secret HS256 forte
  return crypto.randomBytes(32).toString('base64');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

const secret = process.env.PG_JWT_SECRET ?? generateSecret();

if (secret.length < 32) {
  console.error('ERRO: PG_JWT_SECRET precisa ter pelo menos 32 caracteres.');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + TOKEN_TTL_SECONDS;
const iss = 'thribus-pg-staging';

const anonJwt = signJwt(
  { role: 'anon', iss, iat: now, exp },
  secret,
);

const serviceJwt = signJwt(
  { role: 'service_role', iss, iat: now, exp },
  secret,
);

const padPassword = crypto.randomBytes(24).toString('base64url');

console.log('═'.repeat(70));
console.log('  PostgREST self-hosted — chaves geradas');
console.log('═'.repeat(70));
console.log();
console.log('### 1. JWT secret (PostgREST + GoTrue se usar)');
console.log(`PG_JWT_SECRET="${secret}"`);
console.log();
console.log('### 2. anon key (frontend, requests sem login)');
console.log(`SUPABASE_ANON_KEY="${anonJwt}"`);
console.log();
console.log('### 3. service_role key (worker, bypass RLS)');
console.log(`SUPABASE_SERVICE_ROLE_KEY="${serviceJwt}"`);
console.log();
console.log('### 4. Senha do role authenticator no Postgres');
console.log(`PG_AUTHENTICATOR_PASSWORD="${padPassword}"`);
console.log();
console.log('═'.repeat(70));
console.log('  Próximos passos:');
console.log('═'.repeat(70));
console.log();
console.log('  1. Rodar `01-roles.sql` no Postgres self-hosted (cria roles)');
console.log('  2. Setar a senha do authenticator no Postgres:');
console.log('       ALTER ROLE authenticator WITH PASSWORD \'$PG_AUTHENTICATOR_PASSWORD\';');
console.log('  3. Subir PostgREST no Coolify usando docker-compose.yml deste dir');
console.log('  4. Inserir as 4 chaves acima como env vars no Coolify');
console.log('  5. Smoke test:');
console.log('       curl -H "apikey: $SUPABASE_ANON_KEY" https://<sua-url>/skills');
console.log();
console.log('  Validade dos tokens: ~100 anos. Pra invalidar, troque o JWT_SECRET');
console.log('  e rode este script de novo — JWTs antigos viram inválidos.');
console.log();
