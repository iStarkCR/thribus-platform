-- ============================================================================
-- Migration: Governance + Orchestration + Integrations + Compliance
-- ============================================================================
-- Tira do mock as 4 últimas páginas da plataforma:
--   - Governança: membros, audit log, retenção, SLA, white-label
--   - Orquestração: router rules, workflows, handoffs, decision traces
--   - Integrações: catálogo, approval queue, custom tools
--   - Compliance: evidence packs (LGPD/SOC2/ISO)
-- Convenções do projeto: workspace_id TEXT, agent_id TEXT, RLS via user_workspaces.
-- ============================================================================

-- ─── GOVERNANÇA ─────────────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'operador' check (role in ('admin','supervisor','operador','auditor')),
  status text not null default 'invited' check (status in ('active','invited','suspended')),
  two_factor_enabled boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  actor_name text not null,
  actor_email text not null,
  action text not null,
  resource text not null,
  resource_id text not null,
  ip text not null default 'internal',
  user_agent text not null default 'system',
  diff text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_workspace on public.audit_log(workspace_id, created_at desc);

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade unique,
  conversations_days integer not null default 365,
  executions_days integer not null default 180,
  audit_log_days integer not null default 730,
  knowledge_chunks_days integer,
  region text not null default 'br-sa-east-1' check (region in ('br-sa-east-1','us-east-1','eu-west-1')),
  data_residency_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.sla_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  metric text not null check (metric in ('first_response_seconds','resolution_minutes','uptime_pct','csat')),
  target numeric(10,2) not null,
  actual numeric(10,2) not null default 0,
  status text not null default 'meeting' check (status in ('meeting','at_risk','breached')),
  period text not null default 'daily' check (period in ('daily','weekly','monthly')),
  updated_at timestamptz not null default now()
);

create table if not exists public.branding_configs (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  workspace_name text not null,
  primary_color text not null default '#6B8F5E',
  accent_color text not null default '#D4C9A8',
  logo_url text,
  custom_domain text,
  email_from_name text not null,
  email_from_address text not null,
  login_background_url text,
  footer_text text not null default '',
  updated_at timestamptz not null default now()
);

-- ─── ORQUESTRAÇÃO ───────────────────────────────────────────────────────────
create table if not exists public.router_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  intent text not null,
  matcher text not null,
  target_agent_id text not null references public.agents(id) on delete cascade,
  priority integer not null default 5,
  enabled boolean not null default true,
  hits_30d integer not null default 0,
  precision_pct numeric(4,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_router_rules_workspace on public.router_rules(workspace_id, priority desc);

create table if not exists public.orchestration_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null check (trigger_type in ('sla_breach','message_received','tool_failed','sentiment_negative','silent_lead','tag_added')),
  trigger_config jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  runs_30d integer not null default 0,
  success_rate numeric(4,3) not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  conversation_id text,
  customer_name text not null,
  from_agent_id text references public.agents(id) on delete set null,
  from_agent_name text not null,
  to_agent_id text references public.agents(id) on delete set null,
  to_agent_name text not null,
  reason text not null,
  context_preserved boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_handoffs_workspace on public.agent_handoffs(workspace_id, created_at desc);

create table if not exists public.decision_traces (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  conversation_id text,
  agent_id text references public.agents(id) on delete set null,
  agent_name text not null,
  user_query text not null,
  final_answer text,
  steps jsonb not null default '[]'::jsonb,
  total_latency_ms integer not null default 0,
  total_tokens integer not null default 0,
  status text not null default 'resolved' check (status in ('resolved','escalated','failed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_decision_traces_workspace on public.decision_traces(workspace_id, created_at desc);

-- ─── INTEGRAÇÕES ────────────────────────────────────────────────────────────
create table if not exists public.integrations_catalog (
  id text primary key,
  name text not null,
  vendor text not null,
  category text not null check (category in ('crm','erp','comms','payments','productivity','analytics','custom')),
  description text not null default '',
  logo_emoji text not null default '🔌',
  logo_slug text,
  status text not null default 'available' check (status in ('available','connected','degraded','deprecated')),
  tool_count integer not null default 0,
  connected_workspaces integer not null default 0,
  auth_type text not null default 'apikey' check (auth_type in ('oauth','apikey','basic','token')),
  destructive boolean not null default false,
  popular boolean not null default false,
  docs_url text,
  install_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  agent_name text not null,
  tool_name text not null,
  integration_id text references public.integrations_catalog(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  notes text
);
create index if not exists idx_tool_approvals_pending on public.tool_approvals(workspace_id, requested_at desc) where status = 'pending';

create table if not exists public.custom_tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  method text not null default 'GET' check (method in ('GET','POST','PUT','PATCH','DELETE')),
  endpoint text not null,
  schema_def text not null default '{}',
  destructive boolean not null default false,
  invocations_30d integer not null default 0,
  error_rate numeric(5,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ─── COMPLIANCE ─────────────────────────────────────────────────────────────
create table if not exists public.compliance_pack_builds (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  pack text not null check (pack in ('lgpd','soc2','iso27001','gdpr','pci_dss')),
  pack_label text not null,
  status text not null default 'idle' check (status in ('idle','building','ready','expired')),
  sections jsonb not null default '[]'::jsonb,
  evidence_count integer not null default 0,
  builded_at timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, pack)
);

-- ─── Triggers updated_at ────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'workspace_members','retention_policies','sla_targets','branding_configs',
    'router_rules','orchestration_workflows','integrations_catalog',
    'custom_tools','compliance_pack_builds'
  ])
  loop
    execute format('drop trigger if exists trg_%I_touch on public.%I;', t, t);
    execute format('create trigger trg_%I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
  end loop;
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.workspace_members enable row level security;
alter table public.audit_log enable row level security;
alter table public.retention_policies enable row level security;
alter table public.sla_targets enable row level security;
alter table public.branding_configs enable row level security;
alter table public.router_rules enable row level security;
alter table public.orchestration_workflows enable row level security;
alter table public.agent_handoffs enable row level security;
alter table public.decision_traces enable row level security;
alter table public.integrations_catalog enable row level security;
alter table public.tool_approvals enable row level security;
alter table public.custom_tools enable row level security;
alter table public.compliance_pack_builds enable row level security;

-- Select workspace-aware + write nas tabelas editáveis pelo painel
do $$
declare t text;
begin
  for t in select unnest(array[
    'workspace_members','retention_policies','sla_targets','branding_configs',
    'router_rules','orchestration_workflows','tool_approvals','custom_tools',
    'compliance_pack_builds'
  ])
  loop
    execute format($p$
      drop policy if exists "%I_workspace_select" on public.%I;
      create policy "%I_workspace_select" on public.%I for select using (
        workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
      );
      drop policy if exists "%I_workspace_write" on public.%I;
      create policy "%I_workspace_write" on public.%I for all using (
        workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
      );
    $p$, t, t, t, t, t, t, t, t);
  end loop;
end $$;

-- Audit log: append-only pelo client — select + insert, sem update/delete
drop policy if exists "audit_log_workspace_select" on public.audit_log;
create policy "audit_log_workspace_select" on public.audit_log for select using (
  workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
);
drop policy if exists "audit_log_workspace_insert" on public.audit_log;
create policy "audit_log_workspace_insert" on public.audit_log for insert with check (
  workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
);

-- Handoffs e traces: produzidos pelo worker (service role) — client só lê
drop policy if exists "agent_handoffs_workspace_select" on public.agent_handoffs;
create policy "agent_handoffs_workspace_select" on public.agent_handoffs for select using (
  workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
);
drop policy if exists "decision_traces_workspace_select" on public.decision_traces;
create policy "decision_traces_workspace_select" on public.decision_traces for select using (
  workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
);

-- Catálogo de integrações: público (read sem auth)
drop policy if exists "integrations_catalog_public" on public.integrations_catalog;
create policy "integrations_catalog_public" on public.integrations_catalog for select using (true);

-- ─── Seed do catálogo de integrações ────────────────────────────────────────
-- Catálogo é dado de produto (não dado de cliente) — entra direto na migration.
insert into public.integrations_catalog
  (id, name, vendor, category, description, logo_emoji, logo_slug, status, tool_count, connected_workspaces, auth_type, destructive, popular, docs_url, install_count)
values
  ('int_hubspot','HubSpot','HubSpot Inc','crm','Sync contatos, deals e tickets. 14 tools (criar lead, mover deal, log atividade...).','🟧','hubspot','connected',14,3,'oauth',true,true,'https://developers.hubspot.com',28),
  ('int_ixc','IXC Provedor','IXC Soft','erp','ERP de ISPs — consulta cliente, contratos, faturas, abre OS. 22 tools.','🟦','ixc','connected',22,2,'token',true,true,null,14),
  ('int_stripe','Stripe','Stripe','payments','Cobrança, refunds, subscriptions, customer portal. 11 tools.','🟪','stripe','connected',11,1,'apikey',true,true,null,19),
  ('int_slack','Slack','Salesforce','comms','Enviar msg, criar canal, abrir thread, postar arquivo. 8 tools.','🟫','slack','connected',8,4,'oauth',false,true,null,41),
  ('int_sheets','Google Sheets','Google','productivity','Ler, append, atualizar células, criar planilha. 6 tools.','🟢','googlesheets','connected',6,5,'oauth',false,true,null,52),
  ('int_gmail','Gmail','Google','comms','Enviar email, ler thread, marcar lido, label. 7 tools.','✉️','gmail','available',7,0,'oauth',false,false,null,33),
  ('int_360dialog','360dialog WhatsApp','360dialog','comms','WhatsApp Business API — enviar template, mídia, ler status. 9 tools.','🟢','whatsapp','connected',9,2,'apikey',false,false,null,11),
  ('int_geogrid','Geogrid','Geogrid','analytics','Consulta de viabilidade técnica por endereço — área de cobertura ISP. 3 tools.','🗺️','geogrid','connected',3,1,'apikey',false,false,null,4),
  ('int_pipedrive','Pipedrive','Pipedrive','crm','CRM alternativo ao HubSpot. Deal stages, persons, activities. 12 tools.','🟩','pipedrive','available',12,0,'oauth',true,false,null,7),
  ('int_pagarme','Pagar.me','Stone','payments','Adquirência BR — cobrança PIX, boleto, cartão, antecipação. 13 tools.','💳','pagarme','available',13,0,'apikey',true,false,null,6),
  ('int_asaas','Asaas','Asaas','payments','Gateway BR completo — PIX (instantâneo + QR), boleto, cartão, assinaturas recorrentes, link de pagamento, antecipação. Ideal pra cliente final BR (PF/PJ). 16 tools.','🟢','asaas','connected',16,4,'apikey',true,true,'https://docs.asaas.com',24),
  ('int_mercadopago','Mercado Pago','MercadoLibre','payments','Gateway BR com maior capilaridade — PIX, boleto, cartão, parcelamento sem juros, checkout transparente. 14 tools.','💛','mercadopago','available',14,0,'oauth',true,true,null,11),
  ('int_iugu','Iugu','Iugu','payments','Foco em recorrência BR — assinaturas, dunning (cobrança automática de inadimplentes), split de pagamento, marketplace. 12 tools.','🔵','iugu','available',12,0,'apikey',true,false,null,8),
  ('int_efi','Efí (Gerencianet)','Efí Bank','payments','Banking + PIX nativo — emissão direta como instituição financeira BC, sem intermediário. Taxa mais baixa. 9 tools.','🟠','efi','available',9,0,'apikey',true,false,null,5),
  ('int_cobrefacil','Cobre Fácil','Cobre Fácil','payments','Cobrança simples BR — boleto + PIX, ideal pra pequenas operações. 8 tools.','🟤','cobrefacil','available',8,0,'apikey',true,false,null,2),
  ('int_amplitude','Amplitude','Amplitude','analytics','Track event, criar cohort, pull insight. 5 tools.','📊','amplitude','available',5,0,'apikey',false,false,null,9),
  ('int_clickup','ClickUp','ClickUp','productivity','Criar task, mover status, comentar, atribuir. 10 tools.','🟣','clickup','available',10,0,'apikey',false,false,null,12),
  ('int_chatwoot','Chatwoot / Talki','Chatwoot','comms','CRM de atendimento — manda msg pro lead, troca label, escala humano. 11 tools.','🟦','chatwoot','connected',11,3,'token',false,true,null,22),
  ('int_zoho','Zoho CRM','Zoho','crm','CRM corporativo — leads, deals, contas. 15 tools.','🟥','zoho','available',15,0,'oauth',true,false,null,3),
  ('int_notion','Notion','Notion Labs','productivity','Ler page, criar database row, append block. 6 tools.','⬛','notion','available',6,0,'oauth',false,false,null,18),
  ('int_supabase','Supabase','Supabase','productivity','Query SQL controlada, RPC, storage. 5 tools.','🟢','supabase','connected',5,6,'apikey',true,false,null,31)
on conflict (id) do nothing;
