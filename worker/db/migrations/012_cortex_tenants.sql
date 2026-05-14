-- ══════════════════════════════════════════════════════
-- Migration 012 — Cortex Multi-Tenancy (Fase 2)
-- ══════════════════════════════════════════════════════
-- Tabelas pra suportar multi-tenant em produção:
--
-- 1. cortex_tenants     → cadastro de tenants (clientes do Cortex)
-- 2. cortex_api_keys    → API keys com hash + escopo + limites
-- 3. cortex_usage_daily → uso agregado por tenant/dia (pra billing + cost limit)
--
-- Substitui o modo "env var CORTEX_API_KEYS" da Fase 0. O auth.ts checa
-- primeiro DB, e se a migration não tiver sido aplicada cai no modo env.
-- ══════════════════════════════════════════════════════

create table if not exists cortex_tenants (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  slug            text not null unique,
  plan            text not null default 'starter',  -- starter|growth|scale|enterprise
  status          text not null default 'active',   -- active|suspended|trial
  -- Limites por mês (zerados na virada)
  monthly_message_limit  integer,
  monthly_cost_limit_usd numeric(10,2),
  -- Config — agentes habilitados, override de prompt, etc
  config          jsonb not null default '{}'::jsonb,
  -- Workspace legado (Bianca atual roda em workspace específico)
  workspace_id    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_tenants_status_idx on cortex_tenants(status);

create table if not exists cortex_api_keys (
  id              bigserial primary key,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- Hash da key (nunca guardamos o segredo em claro)
  key_hash        text not null unique,
  -- Prefixo identificável pra UX (primeiros 8 chars: "ck_live_") — não secret
  key_prefix      text not null,
  -- Nome humano (ex: "Production - Backend")
  name            text not null,
  -- Escopos — array livre: ['analyze', 'stream', 'agents:read']
  scopes          text[] not null default '{analyze,stream,agents:read}',
  -- Status
  status          text not null default 'active',  -- active|revoked
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

create index if not exists cortex_api_keys_tenant_idx on cortex_api_keys(tenant_id);
create index if not exists cortex_api_keys_status_idx on cortex_api_keys(status);

create table if not exists cortex_usage_daily (
  id              bigserial primary key,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  day             date not null,
  -- Contadores
  request_count           integer not null default 0,
  message_count           integer not null default 0,
  input_tokens            bigint not null default 0,
  output_tokens           bigint not null default 0,
  cache_read_tokens       bigint not null default 0,
  estimated_cost_usd      numeric(12,6) not null default 0,
  -- Erros
  error_count             integer not null default 0,
  blocked_count           integer not null default 0,
  unique (tenant_id, day)
);

create index if not exists cortex_usage_daily_tenant_day_idx
  on cortex_usage_daily(tenant_id, day desc);

comment on table cortex_tenants is
  'Cortex Brain — cadastro de tenants (clientes da plataforma).';
comment on table cortex_api_keys is
  'Cortex Brain — API keys (hash only) com scopes.';
comment on table cortex_usage_daily is
  'Cortex Brain — uso agregado por tenant/dia (billing + cost limit).';
