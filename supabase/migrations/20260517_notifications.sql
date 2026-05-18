-- ============================================================================
-- Migration: Notifications — central de alertas in-app
-- ============================================================================

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
                  -- null = broadcast pra todos do workspace
  kind            text not null check (kind in ('system','approval','alert','mention','workflow','billing','announcement')),
  title           text not null,
  body            text,
  href            text,                                   -- rota interna pra abrir ao clicar
  source          text,                                   -- "Agent Bianca", "Sistema", "Workflow Engine"
  read            boolean not null default false,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_workspace_user_unread
  on public.notifications(workspace_id, user_id, read, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read) where read = false;

-- RLS
alter table public.notifications enable row level security;

-- Usuário vê broadcasts do workspace dele + suas próprias
create policy "notifications_select"
  on public.notifications for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  );

-- Usuário pode marcar como lida só as próprias (ou broadcasts)
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

comment on table public.notifications is
  'Central de alertas in-app. user_id null = broadcast pro workspace inteiro.';
