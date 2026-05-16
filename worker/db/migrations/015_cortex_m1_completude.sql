-- ══════════════════════════════════════════════════════
-- Migration 015 — Cortex M1 Completude (Workflows + Notifications + Webhooks + Approvals + Templates + Talki Runtime)
-- ══════════════════════════════════════════════════════

-- ─── 1. Workflows ────────────────────────────────────────────────────────
create table if not exists cortex_workflows (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  name            text not null,
  description     text,
  -- Trigger config
  trigger_type    text not null,           -- 'webhook' | 'event' | 'schedule' | 'manual'
  trigger_config  jsonb not null default '{}'::jsonb,
  -- Steps: array de { id, type, config, on_success, on_failure }
  steps           jsonb not null default '[]'::jsonb,
  enabled         boolean not null default true,
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cortex_workflows_tenant_idx on cortex_workflows(tenant_id, enabled);
create index if not exists cortex_workflows_trigger_idx on cortex_workflows(tenant_id, trigger_type) where enabled;

create table if not exists cortex_workflow_runs (
  id              bigserial primary key,
  workflow_id     text not null references cortex_workflows(id) on delete cascade,
  tenant_id       text not null,
  trigger_payload jsonb,
  status          text not null default 'running',  -- running|completed|failed|paused
  current_step    integer not null default 0,
  context         jsonb not null default '{}'::jsonb,  -- vars compartilhadas entre steps
  steps_log       jsonb not null default '[]'::jsonb,  -- log de execução por step
  error           text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists cortex_workflow_runs_tenant_idx on cortex_workflow_runs(tenant_id, started_at desc);
create index if not exists cortex_workflow_runs_workflow_idx on cortex_workflow_runs(workflow_id, started_at desc);
create index if not exists cortex_workflow_runs_status_idx on cortex_workflow_runs(status) where status in ('running', 'paused');

-- ─── 2. Notifications ────────────────────────────────────────────────────
create table if not exists cortex_notifications (
  id              bigserial primary key,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- Destinatário (user OU channel webhook OU email direto)
  user_id         text references cortex_users(id),
  channel         text not null,            -- 'email' | 'slack' | 'in_app' | 'webhook' | 'whatsapp'
  destination     text,                     -- email address, slack webhook url, phone, etc
  -- Conteúdo
  title           text not null,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  category        text,                     -- 'workflow' | 'approval' | 'alert' | 'system'
  priority        text not null default 'normal',  -- 'low'|'normal'|'high'|'urgent'
  -- Estado
  status          text not null default 'pending', -- pending|sent|failed|read
  sent_at         timestamptz,
  read_at         timestamptz,
  error           text,
  -- Origem
  source          text,                     -- 'workflow:abc' | 'agent:bianca' | 'approval:xyz'
  created_at      timestamptz not null default now()
);
create index if not exists cortex_notifications_user_idx on cortex_notifications(user_id, status, created_at desc);
create index if not exists cortex_notifications_tenant_idx on cortex_notifications(tenant_id, created_at desc);
create index if not exists cortex_notifications_status_idx on cortex_notifications(status, priority) where status = 'pending';

create table if not exists cortex_notification_prefs (
  id              bigserial primary key,
  user_id         text not null references cortex_users(id) on delete cascade,
  category        text not null,
  channel         text not null,
  enabled         boolean not null default true,
  unique (user_id, category, channel)
);

-- ─── 3. Outgoing webhooks ────────────────────────────────────────────────
create table if not exists cortex_outgoing_webhooks (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  name            text not null,
  url             text not null,
  -- Eventos: ['analyze.done', 'contract.signed', 'proposal.accepted', '*']
  events          text[] not null default '{*}',
  -- Secret pra HMAC signature (cliente valida com mesmo segredo)
  secret          text not null,
  enabled         boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_outgoing_webhooks_tenant_idx on cortex_outgoing_webhooks(tenant_id) where enabled;

create table if not exists cortex_webhook_deliveries (
  id              bigserial primary key,
  webhook_id      text not null references cortex_outgoing_webhooks(id) on delete cascade,
  tenant_id       text not null,
  event_type      text not null,
  payload         jsonb not null,
  status          text not null,           -- 'pending' | 'success' | 'failed' | 'retry'
  http_status     integer,
  response_body   text,
  attempts        integer not null default 0,
  next_retry_at   timestamptz,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);
create index if not exists cortex_webhook_deliveries_webhook_idx on cortex_webhook_deliveries(webhook_id, created_at desc);
create index if not exists cortex_webhook_deliveries_retry_idx on cortex_webhook_deliveries(status, next_retry_at) where status = 'retry';

-- ─── 4. Approvals (fila de aprovação humana) ─────────────────────────────
create table if not exists cortex_approvals (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- Quem pediu
  source          text not null,           -- 'agent:bianca' | 'workflow:abc'
  trace_id        text,
  -- O que está pedindo aprovação
  action_type     text not null,           -- 'tool_call' | 'transaction' | 'message_send' | 'data_change'
  action_payload  jsonb not null,
  risk_level      integer not null,        -- 0-4
  context         text,                     -- humanly readable: "Enviar contrato X pra cliente Y"
  -- Estado
  status          text not null default 'pending',  -- pending|approved|rejected|expired|auto_approved
  decided_by      text references cortex_users(id),
  decision_reason text,
  decided_at      timestamptz,
  -- Expiração automática
  expires_at      timestamptz,
  -- Callback opcional (workflow continua)
  resume_workflow_run bigint references cortex_workflow_runs(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_approvals_tenant_idx on cortex_approvals(tenant_id, status, created_at desc);
create index if not exists cortex_approvals_pending_idx on cortex_approvals(tenant_id, expires_at) where status = 'pending';

-- ─── 5. Agent Templates (marketplace por vertical) ───────────────────────
create table if not exists cortex_agent_templates (
  id              text primary key default gen_random_uuid()::text,
  slug            text not null unique,    -- 'isp-bianca' | 'clinic-receptionist' | …
  name            text not null,
  category        text not null,            -- 'sales'|'support'|'finance'|'hr'|'ops'
  vertical        text not null,            -- 'isp'|'clinic'|'ecommerce'|'real_estate'|'accounting'|'law'|'salon'|'saas'
  description     text not null,
  -- Template config (vira AgentDefinition no clone)
  system_prompt   text not null,
  intents         text[] not null default '{}',
  suggested_tools text[] not null default '{}',
  initial_knowledge text,                   -- markdown da base de conhecimento sugerida
  model_default   text not null default 'claude-haiku-4-5-20251001',
  -- Metadados
  icon            text,
  preview_messages jsonb not null default '[]'::jsonb,  -- conversa de exemplo pra demo
  install_count   integer not null default 0,
  is_official     boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_agent_templates_vertical_idx on cortex_agent_templates(vertical, category);

-- Tabela de agentes instalados a partir de template (override do template no tenant)
create table if not exists cortex_tenant_agents (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  agent_id        text not null,            -- ID lógico (pode ser override do built-in ou novo)
  template_id     text references cortex_agent_templates(id),
  -- Overrides do tenant em cima do built-in ou template
  display_name    text,
  system_prompt   text,
  model           text,
  enabled         boolean not null default true,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (tenant_id, agent_id)
);
create index if not exists cortex_tenant_agents_tenant_idx on cortex_tenant_agents(tenant_id, enabled);

-- ─── 6. Comments ─────────────────────────────────────────────────────────
comment on table cortex_workflows is 'M1 — automação visual: trigger → steps → ações';
comment on table cortex_workflow_runs is 'M1 — histórico de execuções com log por step';
comment on table cortex_notifications is 'M1 — eventos enviados para users/canais externos';
comment on table cortex_outgoing_webhooks is 'M1 — webhook outbound pro sistema do cliente';
comment on table cortex_approvals is 'M1 — fila de aprovação humana para ações risco ≥3';
comment on table cortex_agent_templates is 'M1 — marketplace de agentes por vertical';
