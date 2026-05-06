-- ══════════════════════════════════════════════════════
-- Thribus Agents — Schema Postgres (Supabase)
-- ══════════════════════════════════════════════════════
-- Cole este arquivo inteiro no SQL Editor do Supabase e dê run.
-- Idempotente: pode rodar várias vezes sem erro.

-- Extensões
create extension if not exists "pgcrypto";

-- ══════════════════════════════════════════════════════
-- AGENTS
-- ══════════════════════════════════════════════════════
create table if not exists agents (
  id                       text primary key default gen_random_uuid()::text,
  name                     text not null,
  client                   text not null,
  sector                   text not null default 'A configurar',
  type                     text not null default 'modular',
  status                   text not null default 'standby',
  model                    text not null,
  system_prompt            text not null default '',
  tools                    text[] not null default '{}',
  channel                  text,                                    -- slug do canal TexNet (ex: texnet-testeti)
  stats_today              integer not null default 0,
  stats_resolution         integer not null default 0,
  stats_avg_response_time  numeric(6,2) not null default 0,
  stats_escalated          integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index if not exists agents_channel_idx on agents(channel) where channel is not null;

-- ══════════════════════════════════════════════════════
-- TOOLS
-- ══════════════════════════════════════════════════════
create table if not exists tools (
  id          text primary key default gen_random_uuid()::text,
  name        text not null unique,
  description text not null,
  endpoint    text not null,
  method      text not null default 'POST'
              check (method in ('GET','POST','PUT','PATCH','DELETE')),
  scope       text not null default 'global',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tools_scope_active_idx on tools(scope, active);

create table if not exists tool_parameters (
  id          text primary key default gen_random_uuid()::text,
  tool_id     text not null references tools(id) on delete cascade,
  name        text not null,
  type        text not null default 'string'
              check (type in ('string','number','boolean')),
  required    boolean not null default false,
  description text not null default ''
);

-- ══════════════════════════════════════════════════════
-- CONVERSATIONS
-- ══════════════════════════════════════════════════════
create table if not exists conversations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references agents(id) on delete cascade,
  external_id     text not null unique,                     -- lead.id no TexNet CRM
  customer_phone  text not null,
  customer_name   text,
  status          text not null default 'active'
                  check (status in ('active','escalated','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conversations_external_id_idx on conversations(external_id);
create index if not exists conversations_agent_id_idx on conversations(agent_id);

-- ══════════════════════════════════════════════════════
-- MESSAGES
-- ══════════════════════════════════════════════════════
create table if not exists messages (
  id              text primary key default gen_random_uuid()::text,
  conversation_id text not null references conversations(id) on delete cascade,
  role            text not null
                  check (role in ('user','assistant','tool')),
  content         text not null,
  external_id     text,                                     -- message.id do TexNet (para dedup)
  tool_call_id    text,
  tool_name       text,
  tokens_in       integer,
  tokens_out      integer,
  cache_hit       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Dedup por message.id do CRM
create unique index if not exists messages_external_id_idx
  on messages(external_id) where external_id is not null;
create index if not exists messages_conversation_id_idx on messages(conversation_id);
create index if not exists messages_created_at_idx on messages(created_at desc);

-- ══════════════════════════════════════════════════════
-- EXECUTIONS (logs do agent loop)
-- ══════════════════════════════════════════════════════
create table if not exists executions (
  id                text primary key default gen_random_uuid()::text,
  agent_id          text not null references agents(id) on delete cascade,
  conversation_id   text not null references conversations(id) on delete cascade,
  customer_phone    text not null,
  customer_name     text,
  status            text not null
                    check (status in ('resolved','escalated','failed','running')),
  tools_used        text[] not null default '{}',
  response_time_ms  integer not null default 0,
  total_tokens      integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd          numeric(10,5) not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists executions_agent_id_idx on executions(agent_id);
create index if not exists executions_status_idx on executions(status);
create index if not exists executions_created_at_idx on executions(created_at desc);

-- ══════════════════════════════════════════════════════
-- ESCALATIONS (humano assumiu)
-- ══════════════════════════════════════════════════════
create table if not exists escalations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references agents(id) on delete cascade,
  conversation_id text not null references conversations(id) on delete cascade,
  customer_phone  text not null,
  customer_name   text,
  reason          text not null,
  priority        text not null default 'medium'
                  check (priority in ('low','medium','high','critical')),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists escalations_pending_idx on escalations(created_at desc) where resolved_at is null;
create index if not exists escalations_agent_id_idx on escalations(agent_id);

-- ══════════════════════════════════════════════════════
-- TRIGGERS — updated_at automático
-- ══════════════════════════════════════════════════════
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists agents_updated_at on agents;
create trigger agents_updated_at before update on agents
  for each row execute function set_updated_at();

drop trigger if exists tools_updated_at on tools;
create trigger tools_updated_at before update on tools
  for each row execute function set_updated_at();

drop trigger if exists conversations_updated_at on conversations;
create trigger conversations_updated_at before update on conversations
  for each row execute function set_updated_at();

-- ══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════
-- Por enquanto: anon pode ler/escrever tudo (single-tenant, sem auth ainda).
-- Quando tiver auth: trocar `using (true)` por checks de auth.uid() e tenants.

alter table agents enable row level security;
alter table tools enable row level security;
alter table tool_parameters enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table executions enable row level security;
alter table escalations enable row level security;

drop policy if exists "all_access" on agents;
create policy "all_access" on agents for all using (true) with check (true);

drop policy if exists "all_access" on tools;
create policy "all_access" on tools for all using (true) with check (true);

drop policy if exists "all_access" on tool_parameters;
create policy "all_access" on tool_parameters for all using (true) with check (true);

drop policy if exists "all_access" on conversations;
create policy "all_access" on conversations for all using (true) with check (true);

drop policy if exists "all_access" on messages;
create policy "all_access" on messages for all using (true) with check (true);

drop policy if exists "all_access" on executions;
create policy "all_access" on executions for all using (true) with check (true);

drop policy if exists "all_access" on escalations;
create policy "all_access" on escalations for all using (true) with check (true);
