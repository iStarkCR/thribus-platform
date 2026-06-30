-- Libera 'tts' / 'whisper' / 'embedding' em cortex_usage.kind, pra registrar o
-- custo de voz/embeddings (antes invisível) e ele aparecer no painel Cortex Brain.
-- Antes: check (kind in ('demand','chat')).

-- Dropa qualquer check existente sobre `kind` (nome pode variar) e recria ampliado.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.cortex_usage'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.cortex_usage drop constraint %I', c);
  end loop;
end $$;

alter table public.cortex_usage
  add constraint cortex_usage_kind_check
  check (kind in ('demand', 'chat', 'tts', 'whisper', 'embedding'));
