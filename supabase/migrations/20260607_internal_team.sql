-- ───────────────────────────────────────────────────────────────────────────
-- Time Interno — Bukowiski COO (protótipo vertical fino)
--
-- Mundo INTERNO (Claude Code / só Charles), isolado do mundo cliente (worker/).
-- Prefixo internal_ pra não colidir com a tabela `agents` (worker/db/schema.sql).
--
-- Comunicação: front (anon/authenticated, Realtime) ⇄ Supabase ⇄ daemon (pg, postgres).
-- Daemon conecta via DATABASE_URL (role postgres → bypassa RLS).
-- ───────────────────────────────────────────────────────────────────────────

-- Função de touch updated_at (idempotente, namespaced)
create or replace function public.internal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Catálogo de colaboradores internos (organograma) ───────────────────────
create table if not exists public.internal_agents (
  slug          text primary key,
  name          text not null,
  area          text,
  model_default text not null default 'sonnet',
  subagent_file text,
  status        text not null default 'idle' check (status in ('active','idle','disabled')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Projetos ───────────────────────────────────────────────────────────────
create table if not exists public.internal_projects (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  brief          text not null default '',
  status         text not null default 'draft'
                 check (status in ('draft','planning','awaiting_approval','approved','running','paused','done','failed')),
  plan_md        text,
  est_cost_usd   numeric(10,4) not null default 0,
  actual_cost_usd numeric(10,4) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── Tarefas do projeto ─────────────────────────────────────────────────────
create table if not exists public.internal_project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.internal_projects(id) on delete cascade,
  seq           integer not null default 0,
  title         text not null,
  agent_slug    text references public.internal_agents(slug),
  status        text not null default 'pending'
                check (status in ('pending','running','awaiting_auth','done','failed','skipped')),
  requires_auth boolean not null default false,
  auth_category text check (auth_category in ('money','prod','dns','client')),
  output_md     text,
  cost_usd      numeric(10,4) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_internal_tasks_project on public.internal_project_tasks(project_id, seq);

-- ─── Chat interno (espelha o WhatsApp dentro do sistema) ────────────────────
create table if not exists public.internal_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null default 'bukowiski-main',
  role            text not null check (role in ('user','assistant','system')),
  content         text not null default '',
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_internal_chat_conv on public.internal_chat_messages(conversation_id, created_at);

-- ─── Fila de comandos front → daemon ────────────────────────────────────────
create table if not exists public.internal_commands (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('chat','plan','approve','reject','execute','cancel')),
  project_id   uuid references public.internal_projects(id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending','processing','done','error')),
  result       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_internal_commands_pending on public.internal_commands(status, created_at);

-- ─── Eventos de custo (1 por run Claude) ────────────────────────────────────
create table if not exists public.internal_cost_events (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references public.internal_projects(id) on delete set null,
  agent_slug        text,
  model             text,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd          numeric(10,5) not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_internal_cost_created on public.internal_cost_events(created_at);

-- ─── Autorizações (gates: money/prod/dns/client) ────────────────────────────
create table if not exists public.internal_authorizations (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.internal_project_tasks(id) on delete cascade,
  project_id  uuid references public.internal_projects(id) on delete cascade,
  category    text not null check (category in ('money','prod','dns','client')),
  summary     text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- ─── Settings (singleton) ───────────────────────────────────────────────────
create table if not exists public.internal_settings (
  id                  integer primary key default 1 check (id = 1),
  cost_ceiling_5h_usd   numeric(10,2) not null default 5,
  cost_ceiling_week_usd numeric(10,2) not null default 50,
  paused              boolean not null default false,
  autonomy_level      text not null default 'balanced' check (autonomy_level in ('conservative','balanced','aggressive')),
  updated_at          timestamptz not null default now()
);

-- ─── Triggers updated_at ────────────────────────────────────────────────────
drop trigger if exists trg_internal_agents_touch on public.internal_agents;
create trigger trg_internal_agents_touch before update on public.internal_agents
  for each row execute function public.internal_touch_updated_at();
drop trigger if exists trg_internal_projects_touch on public.internal_projects;
create trigger trg_internal_projects_touch before update on public.internal_projects
  for each row execute function public.internal_touch_updated_at();
drop trigger if exists trg_internal_tasks_touch on public.internal_project_tasks;
create trigger trg_internal_tasks_touch before update on public.internal_project_tasks
  for each row execute function public.internal_touch_updated_at();
drop trigger if exists trg_internal_settings_touch on public.internal_settings;
create trigger trg_internal_settings_touch before update on public.internal_settings
  for each row execute function public.internal_touch_updated_at();

-- ─── RLS — single-tenant (Charles). authenticated lê/escreve; daemon usa postgres (bypass). ─
do $$
declare t text;
begin
  foreach t in array array[
    'internal_agents','internal_projects','internal_project_tasks',
    'internal_chat_messages','internal_commands','internal_cost_events',
    'internal_authorizations','internal_settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %1$s_rw on public.%1$I
        for all to authenticated
        using (auth.uid() is not null)
        with check (auth.uid() is not null);
    $p$, t);
  end loop;
end $$;

-- ─── Realtime — front observa essas tabelas via postgres_changes ────────────
do $$
declare t text;
begin
  foreach t in array array[
    'internal_projects','internal_project_tasks','internal_chat_messages',
    'internal_commands','internal_cost_events','internal_authorizations','internal_settings'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ─── Seed ───────────────────────────────────────────────────────────────────
insert into public.internal_settings (id) values (1) on conflict (id) do nothing;

insert into public.internal_agents (slug, name, area, model_default, subagent_file, status, active) values
  ('bukowiski', 'Bukowiski', 'Gestão · COO', 'opus',   null, 'active', true),
  ('turing',    'Turing',    'Engenharia · Dev', 'sonnet', '/Users/charlesandrade/.claude/agents/turing-dev.md', 'idle', true)
on conflict (slug) do nothing;
