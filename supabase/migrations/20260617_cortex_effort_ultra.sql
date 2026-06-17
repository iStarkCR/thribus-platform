-- ============================================================================
-- Cortex Brain: 6º nível de esforço "ultra" (Ultracode) além do max
-- ============================================================================
-- O CLI aceita 5 (low/medium/high/xhigh/max). O 6º nível "ultra" é o topo da
-- escala no painel (efeito Ultracode verde); a ponte mapeia ultra → max no CLI.
-- ============================================================================

do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.cortex_brain_config'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%effort%';
  if c is not null then
    execute format('alter table public.cortex_brain_config drop constraint %I', c);
  end if;
end $$;

alter table public.cortex_brain_config
  add constraint cortex_brain_config_effort_check
  check (effort in ('low','medium','high','xhigh','max','ultra'));
