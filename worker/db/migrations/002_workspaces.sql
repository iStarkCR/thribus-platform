-- ══════════════════════════════════════════════════════
-- Migration 002 — Multi-tenant workspaces
-- ══════════════════════════════════════════════════════
-- Cole no SQL Editor do Supabase e execute.

create table if not exists workspaces (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,

  -- LLM
  llm_provider    text not null default 'openai'
                  check (llm_provider in ('openai','anthropic')),
  llm_api_key     text,

  -- CRM
  crm_provider    text
                  check (crm_provider in ('talki','texnet')),
  crm_base_url    text,
  crm_account_id  text,
  crm_api_token   text,

  -- TexNet-specific
  texnet_bot_sender_id   text,

  -- Talki-specific
  talki_required_label   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists workspaces_updated_at on workspaces;
create trigger workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();

-- Adiciona FK em agents
alter table agents
  add column if not exists workspace_id text
  references workspaces(id) on delete set null;

create index if not exists agents_workspace_id_idx on agents(workspace_id);

-- Workspace default pra agents existentes (usa env vars como fallback)
insert into workspaces (id, name, llm_provider, crm_provider, crm_base_url, crm_account_id)
values ('default-texnet', 'Texnet (default)', 'openai', 'talki', 'https://talki.thribustech.com', '5')
on conflict (id) do nothing;

-- Vincula agents existentes ao default
update agents
set workspace_id = 'default-texnet'
where workspace_id is null;

-- RLS
alter table workspaces enable row level security;
drop policy if exists "all_access" on workspaces;
create policy "all_access" on workspaces for all using (true) with check (true);
