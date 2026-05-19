-- ============================================================================
-- Migration: Webhooks Outbound
-- ============================================================================
-- Cliente recebe eventos do Thribus em sistemas dele (CRM/ERP/Slack).
-- Trigger SQL escuta tabelas-chave e ENQUEUE delivery. Edge function
-- webhook-dispatch processa fila com retry exponencial.
-- ============================================================================

create table if not exists public.outbound_webhooks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  label           text not null,
  url             text not null,
  events          text[] not null default '{}'::text[],
                  -- agent.replied, agent.escalated, conversation.created/closed,
                  -- tool.executed, tool.approval_requested, lead.qualified,
                  -- sale.closed, sla.breached
  secret          text not null,                          -- HMAC signing
  active          boolean not null default true,
  success_count   integer not null default 0,
  failure_count   integer not null default 0,
  last_triggered_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_outbound_webhooks_workspace
  on public.outbound_webhooks(workspace_id) where active = true;

create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references public.outbound_webhooks(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  event           text not null,
  url             text not null,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending','success','failed','retrying')),
  http_code       integer,
  attempt_count   integer not null default 0,
  latency_ms      integer not null default 0,
  next_attempt_at timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

create index if not exists idx_webhook_deliveries_pending
  on public.webhook_deliveries(workspace_id, next_attempt_at)
  where status in ('pending','retrying');
create index if not exists idx_webhook_deliveries_webhook_time
  on public.webhook_deliveries(webhook_id, created_at desc);

drop trigger if exists trg_outbound_webhooks_touch on public.outbound_webhooks;
create trigger trg_outbound_webhooks_touch
  before update on public.outbound_webhooks
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.outbound_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy "outbound_webhooks_select"
  on public.outbound_webhooks for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "outbound_webhooks_write"
  on public.outbound_webhooks for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "webhook_deliveries_select"
  on public.webhook_deliveries for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- ─── Trigger: enfileira delivery quando evento qualificado acontece ─────────
create or replace function public.enqueue_webhook_deliveries()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  evt text;
  wh record;
  payload jsonb;
begin
  -- Determina evento baseado na tabela
  if tg_table_name = 'executions' then
    evt := case new.status
      when 'escalated' then 'agent.escalated'
      when 'resolved' then 'agent.replied'
      else null end;
    payload := jsonb_build_object(
      'event', evt,
      'workspace_id', new.workspace_id,
      'execution_id', new.id,
      'agent_id', new.agent_id,
      'customer_name', new.customer_name,
      'tools_used', new.tools_used,
      'cost', new.cost,
      'timestamp', new.created_at
    );
  elsif tg_table_name = 'inbox_conversations' then
    evt := case
      when tg_op = 'INSERT' then 'conversation.created'
      when new.status = 'closed' and old.status != 'closed' then 'conversation.closed'
      else null end;
    payload := jsonb_build_object(
      'event', evt,
      'workspace_id', new.workspace_id,
      'conversation_id', new.id,
      'customer_name', new.customer_name,
      'channel', new.channel,
      'status', new.status,
      'timestamp', now()
    );
  end if;

  if evt is null then return new; end if;

  -- Enfileira em cada webhook ativo que assina esse evento
  for wh in
    select id, url from public.outbound_webhooks
    where workspace_id = new.workspace_id
      and active = true
      and evt = any(events)
  loop
    insert into public.webhook_deliveries (
      webhook_id, workspace_id, event, url, payload, next_attempt_at
    ) values (
      wh.id, new.workspace_id, evt, wh.url, payload, now()
    );
  end loop;

  return new;
end;
$$;

-- Triggers
drop trigger if exists trg_executions_webhook on public.executions;
create trigger trg_executions_webhook
  after insert or update on public.executions
  for each row execute function public.enqueue_webhook_deliveries();

drop trigger if exists trg_inbox_conv_webhook on public.inbox_conversations;
create trigger trg_inbox_conv_webhook
  after insert or update on public.inbox_conversations
  for each row execute function public.enqueue_webhook_deliveries();

comment on table public.outbound_webhooks is
  'Endpoints HTTP do cliente que recebem eventos do Thribus. HMAC signing via secret.';
comment on table public.webhook_deliveries is
  'Fila de entregas. Edge function webhook-dispatch processa com retry exponencial.';
