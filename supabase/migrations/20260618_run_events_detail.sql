-- ============================================================================
-- run_events: guardar o processo COMPLETO de cada passo (abrir pra ver)
-- ============================================================================
-- detail = resumo curto (inline). input = comando/args completos. result =
-- saída do tool (truncada). tool_use_id liga o tool_use ao seu tool_result.
-- ============================================================================

alter table public.run_events add column if not exists input text;
alter table public.run_events add column if not exists result text;
alter table public.run_events add column if not exists tool_use_id text;

create index if not exists idx_run_events_tooluse on public.run_events(ref_id, tool_use_id) where tool_use_id is not null;
