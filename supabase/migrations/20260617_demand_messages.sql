-- ============================================================================
-- Demandas: conversa DENTRO da mesma demanda (thread), não cards novos
-- ============================================================================
-- Cada demanda vira um fio de conversa: tarefa → resultado → resposta do Charles
-- → resposta do Bukowiski → ... tudo no MESMO card. A resposta do Charles é uma
-- mensagem 'pending' role='user'; a ponte lê, executa COM o fio inteiro de
-- contexto e devolve uma mensagem 'done' role='assistant'. O card não se duplica.
--
-- O 1º turno (tarefa + primeiro resultado) continua em team_demands
-- (description/result); as continuações ficam aqui.
-- ============================================================================

create table if not exists public.demand_messages (
  id          uuid primary key default gen_random_uuid(),
  demand_id   uuid not null references public.team_demands(id) on delete cascade,
  user_id     uuid,                                   -- dono (pra RLS)
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  status      text not null default 'done'
              check (status in ('pending','done','error')),
  error       text,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_demand_messages_thread
  on public.demand_messages(demand_id, created_at);
create index if not exists idx_demand_messages_queue
  on public.demand_messages(status, created_at) where status = 'pending';

alter table public.demand_messages enable row level security;

-- Cada um vê/escreve as próprias; super-admin vê tudo. A ponte usa service role.
drop policy if exists "demand_messages_own" on public.demand_messages;
create policy "demand_messages_own" on public.demand_messages
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- Realtime: o thread no card atualiza sozinho quando o Bukowiski responde.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'demand_messages'
  ) then
    alter publication supabase_realtime add table public.demand_messages;
  end if;
end $$;
