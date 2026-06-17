-- ============================================================================
-- Demandas: resposta/continuação (thread)
-- ============================================================================
-- Quando o Bukowiski termina uma demanda e pede uma decisão ("publico no Hub?"),
-- o Charles responde no painel. A resposta vira uma demanda-FILHO (parent_id),
-- que o daemon executa com o contexto da demanda anterior (título + resultado).
-- É o "OK, pode fazer" virando tarefa na fila.
-- ============================================================================

alter table public.team_demands
  add column if not exists parent_id uuid
  references public.team_demands(id) on delete set null;

create index if not exists idx_team_demands_parent
  on public.team_demands(parent_id) where parent_id is not null;
