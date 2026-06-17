-- ============================================================================
-- Rotinas — demandas recorrentes (ex: "relatório do Insta toda segunda 9h")
-- ============================================================================
-- O Charles cria uma rotina; a ponte (tickRoutines) vê next_run_at <= now(),
-- cria uma demanda na fila e agenda o próximo disparo. O time executa como
-- qualquer demanda. É o "Agendar" que o Claude desktop não tem.
-- ============================================================================

create table if not exists public.team_routines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  agent_id      text not null default 'bukowiski-thribus'
                references public.agents(id) on delete cascade,
  title         text not null,
  description   text,
  project       text,
  schedule_kind text not null default 'daily' check (schedule_kind in ('daily','weekly')),
  run_time      text not null default '09:00',   -- HH:MM (hora local)
  weekday       int  not null default 1,         -- 0=dom .. 6=sáb (só weekly)
  active        boolean not null default true,
  next_run_at   timestamptz not null,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_team_routines_due
  on public.team_routines(active, next_run_at) where active;

alter table public.team_routines enable row level security;

drop policy if exists "team_routines_own" on public.team_routines;
create policy "team_routines_own" on public.team_routines
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_team_routines_touch on public.team_routines;
create trigger trg_team_routines_touch before update on public.team_routines
  for each row execute function public.touch_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'team_routines'
  ) then
    alter publication supabase_realtime add table public.team_routines;
  end if;
end $$;
