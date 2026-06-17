-- ============================================================================
-- Cortex Brain: libera o Opus 4.7 fixo (claude-opus-4-7) como opção de modelo
-- ============================================================================
-- O alias 'opus' resolve pro Opus atual (4.8). Pra fixar a geração anterior
-- (4.7), guardamos o ID completo — o bridge passa direto pro `claude --model`.
-- ============================================================================

do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.cortex_brain_config'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%model%';
  if c is not null then
    execute format('alter table public.cortex_brain_config drop constraint %I', c);
  end if;
end $$;

alter table public.cortex_brain_config
  add constraint cortex_brain_config_model_check
  check (model in ('opus','sonnet','haiku','fable','claude-opus-4-7'));
