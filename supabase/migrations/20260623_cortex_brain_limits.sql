-- ============================================================================
-- Limites do plano (janela de 5h + semanal) — espelho do /usage do Claude
-- ============================================================================
-- O CLI engole os headers `anthropic-ratelimit-unified-*` das respostas da API.
-- A ponte (service role) faz uma chamada-sonda mínima (1 token) a cada ~2min,
-- captura a utilização/reset de cada janela e grava aqui. O painel lê e mostra
-- "5h 35% · reseta 16h40 / semana 54%" no rodapé do chat.
--
-- Singleton (id='global') — é o uso do plano Max compartilhado pelo time, não
-- por usuário; por isso a leitura é liberada pra todo o painel.
-- ============================================================================

create table if not exists public.cortex_brain_limits (
  id                  text primary key default 'global',
  five_h_utilization  numeric,        -- 0..1 (fração usada da janela de 5h)
  five_h_reset        timestamptz,    -- quando a janela de 5h zera
  five_h_status       text,           -- allowed | rejected | ...
  seven_d_utilization numeric,        -- 0..1 (fração usada da semana)
  seven_d_reset       timestamptz,
  seven_d_status      text,
  overall_status      text,           -- status unificado
  updated_at          timestamptz not null default now()
);

alter table public.cortex_brain_limits enable row level security;

-- Leitura liberada pro painel (dado do plano compartilhado, não sensível por user).
-- Escrita é só pela ponte (service role bypassa RLS).
drop policy if exists "cortex_brain_limits_read" on public.cortex_brain_limits;
create policy "cortex_brain_limits_read" on public.cortex_brain_limits
  for select using (true);

drop trigger if exists trg_cortex_brain_limits_touch on public.cortex_brain_limits;
create trigger trg_cortex_brain_limits_touch before update on public.cortex_brain_limits
  for each row execute function public.touch_updated_at();

-- Seed da linha global (idempotente).
insert into public.cortex_brain_limits (id) values ('global')
  on conflict (id) do nothing;

-- Realtime: o badge no chat reflete a mudança assim que a ponte regrava.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cortex_brain_limits'
  ) then
    alter publication supabase_realtime add table public.cortex_brain_limits;
  end if;
end $$;
