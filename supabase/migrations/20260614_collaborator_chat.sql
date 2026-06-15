-- ============================================================================
-- Chat direto com colaborador (ex: Bukowiski) — multi-canal
-- ============================================================================
-- O humano (Charles) conversa com um colaborador pelo painel. A mensagem entra
-- como role='user' status='pending'; o daemon do Claude Code (persona do agente)
-- lê o pending, processa e grava a resposta role='assistant'. O mesmo thread
-- agrega Telegram/Talki via `channel`.
--
-- Contrato da ponte (daemon, fora deste repo, usando service role):
--   1. escuta INSERT em collaborator_messages onde role='user' e status='pending'
--   2. marca status='processing'
--   3. roda o Claude Code como o agente → texto de resposta
--   4. insere role='assistant' (status='done') e marca o user msg status='done'
--      (em erro: status='error' + campo error)
-- ============================================================================

create table if not exists public.collaborator_messages (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text not null references public.agents(id) on delete cascade,
  user_id     uuid not null,                       -- quem conversa (auth.uid)
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  status      text not null default 'pending' check (status in ('pending','processing','done','error')),
  channel     text not null default 'thribus' check (channel in ('thribus','telegram','talki')),
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_collab_msg_thread
  on public.collaborator_messages(user_id, agent_id, created_at);
create index if not exists idx_collab_msg_pending
  on public.collaborator_messages(status, created_at) where status = 'pending';

alter table public.collaborator_messages enable row level security;

-- Cada um vê/gerencia o próprio thread; super-admin vê tudo.
-- (o daemon usa service role e ignora RLS pra gravar as respostas)
create policy "collab_msg_own" on public.collaborator_messages
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- Realtime: o painel dá subscribe pra ver a resposta chegar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'collaborator_messages'
  ) then
    alter publication supabase_realtime add table public.collaborator_messages;
  end if;
end $$;
