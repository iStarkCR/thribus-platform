-- ══════════════════════════════════════════════════════
-- Migration 017 — Cortex M3 Ecosystem (RBAC + SSO OIDC + Integrations + White-label)
-- ══════════════════════════════════════════════════════

-- ─── 1. RBAC: permissions adicionais ──────────────────────────────────
-- A coluna `role` em cortex_user_tenants já existe (owner|admin|member|viewer).
-- Adicionar `permissions` jsonb pra override granular por usuário+tenant.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'cortex_user_tenants' and column_name = 'permissions') then
    alter table cortex_user_tenants add column permissions jsonb not null default '{}'::jsonb;
  end if;
end$$;

-- Tabela de role definitions (pra customizar roles além do default 4)
create table if not exists cortex_roles (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text references cortex_tenants(id) on delete cascade,
  slug            text not null,
  name            text not null,
  description     text,
  permissions     jsonb not null default '{}'::jsonb,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- ─── 2. SSO OIDC sessions ─────────────────────────────────────────────
create table if not exists cortex_sso_connections (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text references cortex_tenants(id) on delete cascade,
  -- 'google' | 'microsoft' | 'okta' | 'azure' | 'github'
  provider        text not null,
  -- OIDC/SAML config
  client_id       text,
  client_secret_encrypted text,
  -- domain restriction (só users @empresa.com)
  allowed_domain  text,
  metadata        jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists cortex_sso_states (
  id              text primary key default gen_random_uuid()::text,
  state           text not null unique,
  tenant_id       text references cortex_tenants(id) on delete cascade,
  provider        text not null,
  redirect_after  text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists cortex_sso_states_expires_idx on cortex_sso_states(expires_at);

-- ─── 3. Integrações nativas ────────────────────────────────────────────
create table if not exists cortex_integrations (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- 'hubspot' | 'pipedrive' | 'salesforce' | 'slack' | 'teams' | 'google_calendar'
  provider        text not null,
  display_name    text,
  -- Credenciais cifradas
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at      timestamptz,
  -- Mapping de campos (lead → contact, deal → deal, etc)
  field_mappings  jsonb not null default '{}'::jsonb,
  -- Sync state
  last_sync_at    timestamptz,
  last_sync_status text,
  sync_direction  text not null default 'bidirectional',
  -- 'push' | 'pull' | 'bidirectional'
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists cortex_integration_logs (
  id              bigserial primary key,
  integration_id  text not null references cortex_integrations(id) on delete cascade,
  tenant_id       text not null,
  direction       text not null,
  entity_type     text,
  entity_id       text,
  external_id     text,
  action          text not null,
  status          text not null,
  error           text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_integration_logs_integration_idx on cortex_integration_logs(integration_id, created_at desc);

-- ─── 4. White-label config (pra tenants do tipo "agency") ──────────────
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'cortex_tenants' and column_name = 'white_label') then
    alter table cortex_tenants add column white_label jsonb not null default '{}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'cortex_tenants' and column_name = 'custom_domain') then
    alter table cortex_tenants add column custom_domain text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'cortex_tenants' and column_name = 'parent_tenant_id') then
    alter table cortex_tenants add column parent_tenant_id text references cortex_tenants(id) on delete set null;
  end if;
end$$;

create index if not exists cortex_tenants_parent_idx on cortex_tenants(parent_tenant_id) where parent_tenant_id is not null;
create index if not exists cortex_tenants_custom_domain_idx on cortex_tenants(custom_domain) where custom_domain is not null;

-- ─── Comments ──────────────────────────────────────────────────────────
comment on table cortex_roles is 'M3 — Definições de roles customizadas por tenant';
comment on table cortex_sso_connections is 'M3 — Conexões OIDC/SAML por tenant';
comment on table cortex_integrations is 'M3 — Integrações nativas (HubSpot, Slack, etc) por tenant';
