-- ══════════════════════════════════════════════════════
-- Thribus Worker — Schema Postgres (Supabase)
-- ══════════════════════════════════════════════════════

-- Extensões
create extension if not exists "pgcrypto";

-- ── Agents ─────────────────────────────────────────────
create table if not exists agents (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  client          text not null,
  sector          text not null default 'A configurar',
  type            text not null default 'modular',
  status          text not null default 'standby',
  model           text not null,
  system_prompt   text not null default '',
  tools           text[] not null default '{}',
  inbox_id        integer,           -- ID da inbox no Talki/Chatwoot
  stats_today     integer not null default 0,
  stats_resolution integer not null default 0,
  stats_avg_response_time numeric(6,2) not null default 0,
  stats_escalated integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Tools ──────────────────────────────────────────────
create table if not exists tools (
  id          text primary key default gen_random_uuid()::text,
  name        text not null unique,
  description text not null,
  endpoint    text not null,
  method      text not null default 'POST',
  scope       text not null default 'global',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists tool_parameters (
  id          text primary key default gen_random_uuid()::text,
  tool_id     text not null references tools(id) on delete cascade,
  name        text not null,
  type        text not null default 'string',
  required    boolean not null default false,
  description text not null default ''
);

-- ── Conversations ──────────────────────────────────────
create table if not exists conversations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references agents(id),
  external_id     text not null unique,   -- ID no Talki
  customer_phone  text not null,
  customer_name   text,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conversations_external_id_idx on conversations(external_id);
create index if not exists conversations_agent_id_idx on conversations(agent_id);

-- ── Messages ───────────────────────────────────────────
create table if not exists messages (
  id              text primary key default gen_random_uuid()::text,
  conversation_id text not null references conversations(id) on delete cascade,
  role            text not null,             -- user | assistant | tool
  content         text not null,
  external_id     text,                      -- message_id do Talki (dedup)
  tool_call_id    text,
  tool_name       text,
  tokens_in       integer,
  tokens_out      integer,
  cache_hit       boolean not null default false,
  created_at      timestamptz not null default now()
);

create unique index if not exists messages_external_id_idx
  on messages(external_id) where external_id is not null;
create index if not exists messages_conversation_id_idx on messages(conversation_id);

-- ── Executions ─────────────────────────────────────────
create table if not exists executions (
  id                text primary key default gen_random_uuid()::text,
  agent_id          text not null references agents(id),
  conversation_id   text not null references conversations(id),
  customer_phone    text not null,
  status            text not null,           -- resolved | escalated | failed
  tools_used        text[] not null default '{}',
  response_time_ms  integer not null default 0,
  total_tokens      integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists executions_agent_id_idx on executions(agent_id);
create index if not exists executions_created_at_idx on executions(created_at desc);

-- ── Escalations ────────────────────────────────────────
create table if not exists escalations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references agents(id),
  conversation_id text not null references conversations(id),
  customer_phone  text not null,
  reason          text not null,
  priority        text not null default 'medium',
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
