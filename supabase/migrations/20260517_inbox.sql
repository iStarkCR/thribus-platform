-- ============================================================================
-- Migration: Inbox Unificada
-- ============================================================================
-- Tabelas pra ingestão de conversas multi-canal (Talki/Chatwoot, email, voz,
-- WhatsApp, Instagram). Webhook `talki-webhook` insere aqui em tempo real.
--
-- Pattern: workspace-aware, RLS sem recursion (workspace_id direto na tabela).
-- ============================================================================

-- ─── Tabela inbox_conversations ─────────────────────────────────────────────
create table if not exists public.inbox_conversations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  external_id     text not null,                          -- ID no Talki/Chatwoot
  channel         text not null check (channel in ('whatsapp','email','phone','web','instagram')),
  status          text not null default 'open' check (status in ('open','pending','escalated','closed')),
  customer_id     text,                                   -- ref opcional ao IXC/CRM
  customer_name   text,
  customer_phone  text,
  customer_email  text,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  last_preview    text,
  last_sentiment  numeric(3,2) default 0,                 -- -1.00 a 1.00
  unread_count    integer not null default 0,
  tags            text[] default '{}'::text[],
  metadata        jsonb default '{}'::jsonb,              -- payload Talki original (compactado)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);

create index if not exists idx_inbox_conv_workspace_activity
  on public.inbox_conversations(workspace_id, last_activity_at desc);
create index if not exists idx_inbox_conv_status
  on public.inbox_conversations(workspace_id, status) where status != 'closed';
create index if not exists idx_inbox_conv_external
  on public.inbox_conversations(external_id);

-- ─── Tabela inbox_messages ──────────────────────────────────────────────────
create table if not exists public.inbox_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.inbox_conversations(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  external_id     text,                                   -- ID da msg no Talki
  channel         text not null check (channel in ('whatsapp','email','phone','web','instagram')),
  direction       text not null check (direction in ('in','out')),
  sender_name     text not null,
  sender_id       text,
  body            text,
  is_bot          boolean not null default false,
  attachments     jsonb default '[]'::jsonb,              -- [{name, type, url}]
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_inbox_msg_conversation
  on public.inbox_messages(conversation_id, created_at desc);
create index if not exists idx_inbox_msg_workspace_time
  on public.inbox_messages(workspace_id, created_at desc);

-- ─── Trigger pra atualizar last_activity_at + last_preview na conversa ─────
create or replace function public.update_inbox_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inbox_conversations
  set
    last_activity_at = new.created_at,
    last_preview = left(coalesce(new.body, ''), 200),
    unread_count = case
      when new.direction = 'in' then unread_count + 1
      else unread_count
    end,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_inbox_msg_update_conversation on public.inbox_messages;
create trigger trg_inbox_msg_update_conversation
  after insert on public.inbox_messages
  for each row execute function public.update_inbox_conversation_on_message();

-- ─── Trigger updated_at automático ──────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inbox_conv_touch on public.inbox_conversations;
create trigger trg_inbox_conv_touch
  before update on public.inbox_conversations
  for each row execute function public.touch_updated_at();

-- ─── RLS — workspace-aware (sem recursion) ──────────────────────────────────
alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;

-- Membros do workspace leem
create policy "inbox_conversations_select"
  on public.inbox_conversations for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "inbox_messages_select"
  on public.inbox_messages for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Service role (edge function) escreve livre — sem policy de insert/update
-- pra usuários autenticados (webhook Talki ingere via service_role key).

-- ─── Comentários (documentação inline) ──────────────────────────────────────
comment on table public.inbox_conversations is
  'Conversas multi-canal ingeridas via webhook (Talki/Chatwoot, 360dialog, etc). 1 conversa = 1 thread por cliente/canal.';
comment on table public.inbox_messages is
  'Mensagens individuais. Trigger atualiza conversa parent (last_preview, unread_count, last_activity_at).';
comment on column public.inbox_conversations.external_id is
  'ID original no sistema fonte (Talki conversation_id, Chatwoot conversation.id). Único por workspace.';
comment on column public.inbox_conversations.metadata is
  'Payload original do webhook pra debug. Pode incluir labels, attributes do Chatwoot.';
