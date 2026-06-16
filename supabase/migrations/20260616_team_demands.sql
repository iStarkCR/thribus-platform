-- ============================================================================
-- Demandas do time Thribus — fila que o Bukowiski (e o time) executa
-- ============================================================================
-- O Charles adiciona demandas/projetos no painel (Kanban). Cada demanda em
-- status 'todo' é uma TAREFA NA FILA: o daemon (bridge) lê, marca 'doing', roda
-- o colaborador (claude -p) pra executar, grava o `result` e marca 'done'
-- (ou 'waiting' se precisar de decisão do Charles, 'error' em falha).
--
-- Contrato da ponte (daemon, service role):
--   1. SELECT team_demands WHERE status='todo' ORDER BY priority desc, created_at
--   2. UPDATE status='doing'
--   3. roda o agente (agent_id) com title+description como tarefa
--   4. UPDATE result=..., status='done' (ou 'waiting'/'error' + error)
-- ============================================================================

create table if not exists public.team_demands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                          -- quem criou (auth.uid)
  agent_id    text not null default 'bukowiski-thribus'
              references public.agents(id) on delete cascade,  -- quem executa
  title       text not null,
  description text,
  project     text,                                   -- agrupa por projeto (opcional)
  status      text not null default 'todo'
              check (status in ('todo','doing','waiting','done','error')),
  priority    int  not null default 0,                -- maior = mais urgente
  result      text,                                   -- saída do colaborador
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_team_demands_board
  on public.team_demands(user_id, status, priority desc, created_at);
create index if not exists idx_team_demands_queue
  on public.team_demands(status, priority desc, created_at) where status = 'todo';

alter table public.team_demands enable row level security;

-- Cada um vê/gerencia as próprias demandas; super-admin vê tudo.
-- (o daemon usa service role e ignora RLS pra executar)
create policy "team_demands_own" on public.team_demands
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_team_demands_touch on public.team_demands;
create trigger trg_team_demands_touch before update on public.team_demands
  for each row execute function public.touch_updated_at();

-- Realtime: o Kanban dá subscribe pra ver a demanda mover sozinha (todo→doing→done).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'team_demands'
  ) then
    alter publication supabase_realtime add table public.team_demands;
  end if;
end $$;
