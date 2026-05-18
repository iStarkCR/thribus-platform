-- ============================================================================
-- Migration: Customer 360 — perfil persistente do lead/cliente final
-- ============================================================================
-- Não confundir com workspaces (cliente B2B do Thribus). Aqui é o lead/cliente
-- que conversa COM o bot — Bianca/Renata/Marcos atendem.
--
-- Sync incremental do IXC (via edge function ixc-sync ou ixc-proxy) popula
-- customer_profiles. Agentes capturam customer_facts em runtime.
-- ============================================================================

-- ─── customer_profiles ──────────────────────────────────────────────────────
create table if not exists public.customer_profiles (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  external_id     text,                                   -- ID no IXC (cliente.id) ou outro CRM
  name            text not null,
  phone           text,
  email           text,
  document        text,                                   -- CPF/CNPJ mascarado
  city            text,
  state           text,
  stage           text default 'novo' check (stage in ('novo','qualificado','em_negociacao','cliente','churn')),
  temperature     text default 'morno' check (temperature in ('frio','morno','quente')),
  score           integer default 50 check (score between 0 and 100),
  ltv             numeric(12,2) default 0,
  total_spent     numeric(12,2) default 0,
  sentiment_trend numeric(3,2) default 0,
  tags            text[] default '{}'::text[],
  owner_agent_id  uuid references public.agents(id) on delete set null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, external_id)
);

create index if not exists idx_customer_profiles_workspace
  on public.customer_profiles(workspace_id, last_seen_at desc);
create index if not exists idx_customer_profiles_phone
  on public.customer_profiles(workspace_id, phone) where phone is not null;
create index if not exists idx_customer_profiles_doc
  on public.customer_profiles(workspace_id, document) where document is not null;
create index if not exists idx_customer_profiles_stage
  on public.customer_profiles(workspace_id, stage);

-- ─── customer_facts (memória capturada pelo agente) ─────────────────────────
create table if not exists public.customer_facts (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  source          text not null check (source in ('agent','crm','rag','manual')),
  category        text not null check (category in ('preference','context','objection','milestone')),
  fact            text not null,
  confidence      numeric(3,2) default 0.8 check (confidence between 0 and 1),
  captured_by     text,                                   -- nome do agente ou 'Sistema'
  captured_at     timestamptz not null default now()
);

create index if not exists idx_customer_facts_customer
  on public.customer_facts(customer_id, captured_at desc);

-- ─── customer_interactions (rollup de conversa) ─────────────────────────────
create table if not exists public.customer_interactions (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  channel         text not null,
  agent_name      text,
  summary         text not null,
  sentiment       numeric(3,2) default 0,
  conversation_id uuid references public.inbox_conversations(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_customer_interactions_customer
  on public.customer_interactions(customer_id, created_at desc);

-- ─── customer_contracts (sync do IXC) ───────────────────────────────────────
create table if not exists public.customer_contracts (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  external_id     text,                                   -- contrato.id no IXC
  product         text not null,
  status          text not null check (status in ('ativo','cancelado','pendente','suspenso')),
  mrr             numeric(10,2) not null default 0,
  started_at      timestamptz,
  ends_at         timestamptz,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, external_id)
);

create index if not exists idx_customer_contracts_customer
  on public.customer_contracts(customer_id, status);

-- ─── Trigger touch updated_at ───────────────────────────────────────────────
drop trigger if exists trg_customer_profiles_touch on public.customer_profiles;
create trigger trg_customer_profiles_touch
  before update on public.customer_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_customer_contracts_touch on public.customer_contracts;
create trigger trg_customer_contracts_touch
  before update on public.customer_contracts
  for each row execute function public.touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.customer_profiles enable row level security;
alter table public.customer_facts enable row level security;
alter table public.customer_interactions enable row level security;
alter table public.customer_contracts enable row level security;

create policy "customer_profiles_select"
  on public.customer_profiles for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "customer_facts_select"
  on public.customer_facts for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "customer_interactions_select"
  on public.customer_interactions for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "customer_contracts_select"
  on public.customer_contracts for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Comments
comment on table public.customer_profiles is
  'Perfil persistente do cliente final atendido pelo agente. Sync do IXC + memorização contínua.';
comment on table public.customer_facts is
  'Fatos capturados pelo agente em runtime (preferências, objeções, contexto). Vira knowledge útil em conversas futuras.';
