-- ══════════════════════════════════════════════════════
-- Schema STAGING — clone do schema public no MESMO projeto Supabase
-- ══════════════════════════════════════════════════════
-- Usado pra testar M1, M2, M3, M4 sem tocar em prod.
-- Worker e frontend de staging conectam no mesmo SUPABASE_URL mas
-- usam SUPABASE_SCHEMA=staging (configurável via env).
--
-- Cole INTEIRO no SQL Editor do projeto Supabase prod do Thribus Agents.
-- Idempotente: pode rodar várias vezes (drop+recreate só do schema staging).
--
-- ⚠️ ESTE SQL É SEGURO: cria um schema NOVO chamado "staging".
-- Não toca em nada que esteja em "public" (produção).
-- ══════════════════════════════════════════════════════

-- ─── 1. Cria schema staging (idempotente) ─────────────────────────────────────
create schema if not exists staging;
grant usage on schema staging to anon, authenticated, service_role;
grant all on schema staging to service_role;
alter default privileges in schema staging grant all on tables to service_role;

-- A função set_updated_at já existe em public; ela funciona em qualquer schema
-- porque é referenciada pelo trigger pelo nome qualificado.

-- ─── 2. Tabelas (clonando schema.sql + 002-006) ───────────────────────────────

-- AGENTS
create table if not exists staging.agents (
  id                       text primary key default gen_random_uuid()::text,
  name                     text not null,
  client                   text not null,
  sector                   text not null default 'A configurar',
  type                     text not null default 'modular',
  status                   text not null default 'standby',
  model                    text not null,
  system_prompt            text not null default '',
  tools                    text[] not null default '{}',
  channel                  text,
  workspace_id             text,
  audio_out_enabled        boolean not null default false,
  stats_today              integer not null default 0,
  stats_resolution         integer not null default 0,
  stats_avg_response_time  numeric(6,2) not null default 0,
  stats_escalated          integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists staging_agents_channel_idx on staging.agents(channel) where channel is not null;
create index if not exists staging_agents_workspace_id_idx on staging.agents(workspace_id);

-- WORKSPACES
create table if not exists staging.workspaces (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  llm_provider    text not null default 'openai' check (llm_provider in ('openai','anthropic')),
  llm_api_key     text,
  crm_provider    text check (crm_provider in ('talki','texnet')),
  crm_base_url    text,
  crm_account_id  text,
  crm_api_token   text,
  texnet_bot_sender_id   text,
  talki_required_label   text,
  credentials     jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- TOOLS
create table if not exists staging.tools (
  id          text primary key default gen_random_uuid()::text,
  name        text not null unique,
  description text not null,
  endpoint    text not null,
  method      text not null default 'POST' check (method in ('GET','POST','PUT','PATCH','DELETE')),
  scope       text not null default 'global',
  active      boolean not null default true,
  auth_type   text check (auth_type is null or auth_type in ('basic','bearer','apikey')),
  auth_credentials jsonb,
  extra_headers    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists staging_tools_scope_active_idx on staging.tools(scope, active);

-- TOOL PARAMETERS
create table if not exists staging.tool_parameters (
  id          text primary key default gen_random_uuid()::text,
  tool_id     text not null references staging.tools(id) on delete cascade,
  name        text not null,
  type        text not null default 'string' check (type in ('string','number','boolean')),
  required    boolean not null default false,
  description text not null default ''
);

-- CONVERSATIONS
create table if not exists staging.conversations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references staging.agents(id) on delete cascade,
  external_id     text not null unique,
  customer_phone  text not null,
  customer_name   text,
  status          text not null default 'active' check (status in ('active','escalated','closed')),
  current_state   text,
  state_data      jsonb default '{}'::jsonb,
  state_updated_at timestamptz default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists staging_conversations_external_id_idx on staging.conversations(external_id);
create index if not exists staging_conversations_agent_id_idx on staging.conversations(agent_id);

-- MESSAGES
create table if not exists staging.messages (
  id               text primary key default gen_random_uuid()::text,
  conversation_id  text not null references staging.conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant','tool')),
  content          text not null,
  tool_call_id     text,
  tool_name        text,
  tokens_in        integer,
  tokens_out       integer,
  cache_hit        boolean,
  created_at       timestamptz not null default now()
);
create index if not exists staging_messages_conversation_id_idx on staging.messages(conversation_id);
create index if not exists staging_messages_created_at_idx on staging.messages(created_at desc);

-- EXECUTIONS
create table if not exists staging.executions (
  id                text primary key default gen_random_uuid()::text,
  agent_id          text not null references staging.agents(id) on delete cascade,
  conversation_id   text not null references staging.conversations(id) on delete cascade,
  customer_phone    text not null,
  customer_name     text,
  status            text not null check (status in ('resolved','escalated','failed','running')),
  tools_used        text[] not null default '{}',
  response_time_ms  integer not null default 0,
  total_tokens      integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd          numeric(10,5) not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists staging_executions_agent_id_idx on staging.executions(agent_id);
create index if not exists staging_executions_status_idx on staging.executions(status);
create index if not exists staging_executions_created_at_idx on staging.executions(created_at desc);

-- ESCALATIONS
create table if not exists staging.escalations (
  id              text primary key default gen_random_uuid()::text,
  agent_id        text not null references staging.agents(id) on delete cascade,
  conversation_id text not null references staging.conversations(id) on delete cascade,
  customer_phone  text not null,
  customer_name   text,
  reason          text not null,
  priority        text not null default 'medium' check (priority in ('low','medium','high','critical')),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists staging_escalations_pending_idx on staging.escalations(created_at desc) where resolved_at is null;
create index if not exists staging_escalations_agent_id_idx on staging.escalations(agent_id);

-- AGENT TEMPLATES (M1)
create table if not exists staging.agent_templates (
  id            text primary key default gen_random_uuid()::text,
  slug          text not null unique,
  name          text not null,
  sector        text not null,
  description   text not null default '',
  base_prompt   text not null default '',
  default_tools text[] not null default '{}',
  default_model text not null default 'gpt-4o-mini',
  icon          text,
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists staging_agent_templates_sector_idx on staging.agent_templates(sector) where is_public;

-- ─── 3. FK em staging.agents → staging.workspaces (depois de criar workspaces) ──
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'staging' and constraint_name = 'staging_agents_workspace_fk'
  ) then
    alter table staging.agents
      add constraint staging_agents_workspace_fk
      foreign key (workspace_id) references staging.workspaces(id) on delete set null;
  end if;
end $$;

-- ─── 4. Triggers updated_at (reusa função public.set_updated_at) ──────────────
drop trigger if exists staging_agents_updated_at on staging.agents;
create trigger staging_agents_updated_at before update on staging.agents
  for each row execute function public.set_updated_at();

drop trigger if exists staging_tools_updated_at on staging.tools;
create trigger staging_tools_updated_at before update on staging.tools
  for each row execute function public.set_updated_at();

drop trigger if exists staging_conversations_updated_at on staging.conversations;
create trigger staging_conversations_updated_at before update on staging.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists staging_workspaces_updated_at on staging.workspaces;
create trigger staging_workspaces_updated_at before update on staging.workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists staging_agent_templates_updated_at on staging.agent_templates;
create trigger staging_agent_templates_updated_at before update on staging.agent_templates
  for each row execute function public.set_updated_at();

-- ─── 5. RLS policies (permissivas — service_role bypassa de qualquer jeito) ────
alter table staging.agents enable row level security;
drop policy if exists "all_access" on staging.agents;
create policy "all_access" on staging.agents for all using (true) with check (true);

alter table staging.tools enable row level security;
drop policy if exists "all_access" on staging.tools;
create policy "all_access" on staging.tools for all using (true) with check (true);

alter table staging.tool_parameters enable row level security;
drop policy if exists "all_access" on staging.tool_parameters;
create policy "all_access" on staging.tool_parameters for all using (true) with check (true);

alter table staging.conversations enable row level security;
drop policy if exists "all_access" on staging.conversations;
create policy "all_access" on staging.conversations for all using (true) with check (true);

alter table staging.messages enable row level security;
drop policy if exists "all_access" on staging.messages;
create policy "all_access" on staging.messages for all using (true) with check (true);

alter table staging.executions enable row level security;
drop policy if exists "all_access" on staging.executions;
create policy "all_access" on staging.executions for all using (true) with check (true);

alter table staging.escalations enable row level security;
drop policy if exists "all_access" on staging.escalations;
create policy "all_access" on staging.escalations for all using (true) with check (true);

alter table staging.workspaces enable row level security;
drop policy if exists "all_access" on staging.workspaces;
create policy "all_access" on staging.workspaces for all using (true) with check (true);

alter table staging.agent_templates enable row level security;
drop policy if exists "all_read" on staging.agent_templates;
create policy "all_read" on staging.agent_templates for select using (true);
drop policy if exists "service_write" on staging.agent_templates;
create policy "service_write" on staging.agent_templates for all using (true) with check (true);

-- ─── 6. Seeds dos agent_templates (M1) ────────────────────────────────────────
-- Mesmos seeds da migration 006_agent_templates.sql
insert into staging.agent_templates (slug, name, sector, description, default_model, icon, base_prompt, default_tools)
values (
  'vendas-isp',
  'Vendedor ISP (Bianca)',
  'isp',
  'Agente de vendas pra provedores de internet. Atende leads no WhatsApp, consulta viabilidade, apresenta planos, cadastra cliente no IXC, agenda instalação. Funil completo de venda.',
  'gpt-4o-mini',
  '🎯',
  '# Identidade\nVocê é uma consultora de vendas de fibra óptica. Tom: simpático, acolhedor, objetivo. Use emojis com moderação.\n\n# Variáveis a customizar\n- {NOME_AGENTE}\n- {NOME_PROVEDOR}\n- {VALOR_INSTALACAO}\n- {DDD_REGIAO}\n- {SUPORTE_HORARIO}\n- {CENTRAL_FONE}\n\n[... resto do template ...]',
  array['consultar_viabilidade', 'consultar_cpf', 'listar_planos', 'cadastro_wizard', 'status_contrato', 'consultar_agenda', 'criar_os_agendamento', 'escalar_humano']
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  base_prompt = excluded.base_prompt, default_tools = excluded.default_tools,
  updated_at = now();

insert into staging.agent_templates (slug, name, sector, description, default_model, icon, base_prompt, default_tools)
values (
  'suporte-isp',
  'Suporte Técnico ISP (Renata)',
  'isp',
  'Agente de suporte técnico nível 1 pra provedores. Diagnóstico básico, 2ª via de boleto, status do contrato.',
  'gpt-4o-mini',
  '🛠️',
  '# Identidade\nVocê é {NOME_AGENTE}, atendente de suporte técnico de fibra óptica. Tom: paciente, didático.\n\n[... resto do template ...]',
  array['consultar_cpf', 'status_contrato', 'escalar_humano']
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  base_prompt = excluded.base_prompt, default_tools = excluded.default_tools,
  updated_at = now();

insert into staging.agent_templates (slug, name, sector, description, default_model, icon, base_prompt, default_tools)
values (
  'financeiro-isp',
  'Atendimento Financeiro ISP (Marcos)',
  'isp',
  'Agente focado em cobrança e financeiro. 2ª via de boleto, débitos, negociação.',
  'gpt-4o-mini',
  '💰',
  '# Identidade\nVocê é {NOME_AGENTE}, atendente financeiro. Tom: profissional, claro, empático.\n\n[... resto do template ...]',
  array['consultar_cpf', 'status_contrato', 'escalar_humano']
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  base_prompt = excluded.base_prompt, default_tools = excluded.default_tools,
  updated_at = now();

-- ─── 7. Verificação ───────────────────────────────────────────────────────────
select 'Tabelas em staging:' as info;
select tablename from pg_tables where schemaname = 'staging' order by tablename;

select 'Templates seeded:' as info;
select slug, name, icon, array_length(default_tools, 1) as tools_count
from staging.agent_templates order by sector, name;
