-- ============================================================================
-- run_events — "o que o colaborador está fazendo por trás" (passos ao vivo)
-- ============================================================================
-- A ponte roda o claude em --output-format stream-json e, a cada passo (tool
-- call: ler arquivo, rodar skill, chamar API…), grava um evento aqui. O chat
-- assina por ref_id (id da mensagem ou da demanda) e mostra a atividade ao vivo
-- enquanto o "está pensando…" aparece.
-- ============================================================================

create table if not exists public.run_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  scope       text not null check (scope in ('chat','demand')),
  ref_id      uuid not null,          -- id da mensagem (chat) ou da demanda
  seq         int  not null default 0,
  kind        text not null,          -- 'tool' (futuro: 'status','text')
  label       text,                   -- nome do tool / rótulo
  detail      text,                   -- resumo (arquivo, comando, skill…)
  created_at  timestamptz not null default now()
);

create index if not exists idx_run_events_ref on public.run_events(ref_id, seq, created_at);

alter table public.run_events enable row level security;

drop policy if exists "run_events_own" on public.run_events;
create policy "run_events_own" on public.run_events
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'run_events'
  ) then
    alter publication supabase_realtime add table public.run_events;
  end if;
end $$;
