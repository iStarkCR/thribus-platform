-- ============================================================================
-- Chat por SESSÃO + PASTAS (estilo Claude) — conversa com colaborador
-- ============================================================================
-- O chat com um colaborador (ex: Bukowiski) passa a ter múltiplas sessões,
-- organizáveis em pastas. Cada mensagem pertence a uma sessão.
--
--   chat_folders   — pastas pra organizar sessões (por user + agente)
--   chat_sessions  — conversas individuais (pertencem a uma pasta, opcional)
--   collaborator_messages.session_id — vincula a mensagem à sessão
-- ============================================================================

create table if not exists public.chat_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  agent_id   text not null references public.agents(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_folders_owner on public.chat_folders(user_id, agent_id);

create table if not exists public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  agent_id   text not null references public.agents(id) on delete cascade,
  folder_id  uuid references public.chat_folders(id) on delete set null,
  title      text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chat_sessions_owner on public.chat_sessions(user_id, agent_id, updated_at desc);

alter table public.collaborator_messages
  add column if not exists session_id uuid references public.chat_sessions(id) on delete cascade;
create index if not exists idx_collab_msg_session on public.collaborator_messages(session_id, created_at);

-- RLS: cada um gerencia o próprio; super-admin vê tudo. (Worker usa service role.)
alter table public.chat_folders enable row level security;
alter table public.chat_sessions enable row level security;

create policy "chat_folders_own" on public.chat_folders
  for all using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_own" on public.chat_sessions
  for all using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- Realtime pra sessões (lista atualiza ao vivo)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_sessions'
  ) then
    alter publication supabase_realtime add table public.chat_sessions;
  end if;
end $$;
