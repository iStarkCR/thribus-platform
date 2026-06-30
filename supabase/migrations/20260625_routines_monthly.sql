-- ============================================================================
-- Rotinas mensais — repetir uma demanda todo mês (ex: relatório do dia 1)
-- ============================================================================
-- Adiciona 'monthly' ao schedule_kind e a coluna day_of_month (1–31; dias além do
-- último dia do mês caem no último dia, ex: 31 em fevereiro = 28/29).
-- ============================================================================

alter table public.team_routines
  drop constraint if exists team_routines_schedule_kind_check;

alter table public.team_routines
  add constraint team_routines_schedule_kind_check
  check (schedule_kind in ('daily', 'weekly', 'monthly'));

alter table public.team_routines
  add column if not exists day_of_month int not null default 1;  -- 1–31 (só monthly)

comment on column public.team_routines.day_of_month is 'dia do mês (1–31) pro disparo mensal; clamped ao último dia do mês';
