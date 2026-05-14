-- ══════════════════════════════════════════════════════
-- Migration 014 — Cortex Enterprise (Fase 5)
-- ══════════════════════════════════════════════════════
-- Schema completo pra suíte Enterprise:
--   1. cortex_users           → usuários da plataforma (SSO)
--   2. cortex_user_tenants    → vínculo user ↔ tenant + role
--   3. cortex_modules         → registry dos módulos habilitados por tenant
--   4. cortex_subscriptions   → assinaturas Stripe por tenant
--   5. cortex_contracts       → módulo Contratos
--   6. cortex_proposals       → módulo Propostas
--   7. cortex_talki_threads   → módulo Talki (chat interno)
--   8. cortex_bi_dashboards   → módulo BI (configs de dashboards)
-- ══════════════════════════════════════════════════════

-- ─── 1. Users + SSO ──────────────────────────────────────────────────────
create table if not exists cortex_users (
  id              text primary key default gen_random_uuid()::text,
  email           text not null unique,
  -- bcrypt-style hash; null se usuário só faz SSO externo
  password_hash   text,
  display_name    text,
  -- provider externo (google|microsoft|null=local)
  sso_provider    text,
  sso_external_id text,
  -- Status
  status          text not null default 'active',  -- active|disabled|pending
  email_verified  boolean not null default false,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_users_email_idx on cortex_users(lower(email));

-- ─── 2. User ↔ Tenant (multi-org) ────────────────────────────────────────
create table if not exists cortex_user_tenants (
  id              bigserial primary key,
  user_id         text not null references cortex_users(id) on delete cascade,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  role            text not null default 'member',  -- owner|admin|member|viewer
  created_at      timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists cortex_user_tenants_tenant_idx on cortex_user_tenants(tenant_id);

-- ─── 3. Módulos habilitados por tenant ───────────────────────────────────
create table if not exists cortex_modules (
  id              bigserial primary key,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  module_id       text not null,        -- 'contracts'|'proposals'|'talki'|'bi'
  enabled         boolean not null default true,
  config          jsonb not null default '{}'::jsonb,
  installed_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, module_id)
);

create index if not exists cortex_modules_tenant_idx on cortex_modules(tenant_id);

-- ─── 4. Subscriptions (Stripe) ───────────────────────────────────────────
create table if not exists cortex_subscriptions (
  id                    bigserial primary key,
  tenant_id             text not null references cortex_tenants(id) on delete cascade,
  -- Stripe refs
  stripe_customer_id    text,
  stripe_subscription_id text unique,
  stripe_price_id       text,
  -- Plano lógico (essencial|business|corporate)
  plan_code             text not null default 'essencial',
  -- Ciclo
  billing_cycle         text not null default 'monthly', -- monthly|yearly
  -- Status (mirrors Stripe states)
  status                text not null default 'trialing',
  -- active|trialing|past_due|canceled|incomplete|unpaid
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  trial_ends_at         timestamptz,
  -- Métricas reportadas no último ciclo
  reported_messages     integer not null default 0,
  reported_cost_usd     numeric(12,4) not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists cortex_subscriptions_tenant_idx on cortex_subscriptions(tenant_id);
create index if not exists cortex_subscriptions_status_idx on cortex_subscriptions(status);

-- ─── 5. Contratos ────────────────────────────────────────────────────────
create table if not exists cortex_contracts (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- Identificação
  number          text,
  title           text not null,
  party_name      text not null,
  party_document  text,
  party_email     text,
  -- Conteúdo
  body_md         text not null default '',
  -- Valor e prazo
  total_value     numeric(14,2),
  currency        text not null default 'BRL',
  starts_on       date,
  ends_on         date,
  -- Status (draft|sent|signed|active|expired|canceled)
  status          text not null default 'draft',
  -- Assinatura
  signed_at       timestamptz,
  signed_ip       text,
  -- Auditoria
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_contracts_tenant_idx on cortex_contracts(tenant_id, status, created_at desc);
create index if not exists cortex_contracts_number_idx on cortex_contracts(tenant_id, number) where number is not null;

-- ─── 6. Propostas ────────────────────────────────────────────────────────
create table if not exists cortex_proposals (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  number          text,
  title           text not null,
  client_name     text not null,
  client_email    text,
  -- Body em markdown
  summary         text not null default '',
  body_md         text not null default '',
  -- Itens (array de { description, qty, unit_price, subtotal })
  items           jsonb not null default '[]'::jsonb,
  total_value     numeric(14,2) not null default 0,
  currency        text not null default 'BRL',
  -- Validade
  valid_until     date,
  -- Status (draft|sent|viewed|accepted|rejected|expired)
  status          text not null default 'draft',
  -- Tracking
  sent_at         timestamptz,
  viewed_at       timestamptz,
  accepted_at     timestamptz,
  rejected_at     timestamptz,
  -- Auditoria
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_proposals_tenant_idx on cortex_proposals(tenant_id, status, created_at desc);

-- ─── 7. Talki (chat interno entre membros do tenant) ─────────────────────
create table if not exists cortex_talki_threads (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  title           text,
  kind            text not null default 'direct',  -- direct|group|channel
  is_archived     boolean not null default false,
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now()
);

create table if not exists cortex_talki_messages (
  id              bigserial primary key,
  thread_id       text not null references cortex_talki_threads(id) on delete cascade,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  author_id       text references cortex_users(id),
  -- Mensagem do agente IA aparece com agent_id ao invés de author_id
  agent_id        text,
  body_md         text not null,
  attachments     jsonb not null default '[]'::jsonb,
  reply_to        bigint references cortex_talki_messages(id),
  created_at      timestamptz not null default now()
);

create index if not exists cortex_talki_messages_thread_idx on cortex_talki_messages(thread_id, created_at);

-- ─── 8. BI Dashboards ────────────────────────────────────────────────────
create table if not exists cortex_bi_dashboards (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  title           text not null,
  description     text,
  -- Layout serialized (JSON com widgets, posições, queries)
  layout          jsonb not null default '{}'::jsonb,
  -- Filtros padrão
  default_filters jsonb not null default '{}'::jsonb,
  is_pinned       boolean not null default false,
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_bi_dashboards_tenant_idx on cortex_bi_dashboards(tenant_id, created_at desc);

-- ─── Comments ────────────────────────────────────────────────────────────
comment on table cortex_users is 'Cortex Enterprise — usuários da plataforma (auth+SSO).';
comment on table cortex_user_tenants is 'Cortex Enterprise — RBAC user x tenant (owner/admin/member/viewer).';
comment on table cortex_modules is 'Cortex Enterprise — módulos habilitados por tenant (contracts, proposals, talki, bi).';
comment on table cortex_subscriptions is 'Cortex Enterprise — assinaturas Stripe por tenant + métricas reportadas.';
comment on table cortex_contracts is 'Cortex Enterprise — módulo Contratos com assinatura digital.';
comment on table cortex_proposals is 'Cortex Enterprise — módulo Propostas com tracking de status.';
comment on table cortex_talki_threads is 'Cortex Enterprise — Talki: chat colaborativo entre humanos + agentes.';
comment on table cortex_bi_dashboards is 'Cortex Enterprise — BI: dashboards customizáveis por tenant.';
