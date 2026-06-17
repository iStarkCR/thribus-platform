-- ============================================================================
-- Cortex Brain — controle do "cérebro" do time (modelo + capacidade + uso)
-- ============================================================================
-- Espelho do controle do Claude dentro do painel:
--   • cortex_brain_config  → modelo (alias CLI) + esforço + tetos de gasto.
--     A ponte (bridge, service role) lê 'global' e aplica em toda execução.
--   • cortex_usage         → custo/tokens reais de cada execução do time.
--     A ponte grava (--output-format json → total_cost_usd + usage); o painel
--     agrega pra mostrar "Uso & Limites".
--
-- Modelo é guardado como ALIAS do CLI (opus/sonnet/haiku/fable) — é o que o
-- `claude --model` resolve sozinho pro modelo atual. Esforço (low..max) só
-- vale pra opus/fable (o CLI ignora em sonnet/haiku).
-- ============================================================================

-- ─── Config (singleton 'global') ───────────────────────────────────────────
create table if not exists public.cortex_brain_config (
  scope              text primary key default 'global',  -- 'global' (futuro: agent_id)
  model              text not null default 'opus'
                     check (model in ('opus','sonnet','haiku','fable')),
  effort             text not null default 'high'
                     check (effort in ('low','medium','high','xhigh','max')),
  monthly_budget_usd numeric(10,2) not null default 0,    -- teto/mês (0 = sem limite)
  max_budget_usd     numeric(10,2) not null default 0,    -- teto por execução (0 = sem)
  updated_at         timestamptz not null default now()
);

alter table public.cortex_brain_config enable row level security;

-- Config global do sistema: só super-admin lê/escreve (a ponte usa service role).
drop policy if exists "cortex_brain_config_admin" on public.cortex_brain_config;
create policy "cortex_brain_config_admin" on public.cortex_brain_config
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_cortex_brain_config_touch on public.cortex_brain_config;
create trigger trg_cortex_brain_config_touch before update on public.cortex_brain_config
  for each row execute function public.touch_updated_at();

-- Seed da linha global (idempotente).
insert into public.cortex_brain_config (scope) values ('global')
  on conflict (scope) do nothing;

-- ─── Uso (uma linha por execução da ponte) ──────────────────────────────────
create table if not exists public.cortex_usage (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,                                 -- dono da demanda/conversa
  agent_id           text references public.agents(id) on delete set null,
  kind               text not null default 'demand'
                     check (kind in ('demand','chat')),
  ref_id             uuid,                                 -- id da demanda/mensagem
  model              text,                                 -- alias usado (opus/...)
  effort             text,
  cost_usd           numeric(10,4) not null default 0,
  total_tokens       int not null default 0,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  duration_ms        int not null default 0,
  num_turns          int not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cortex_usage_period
  on public.cortex_usage(created_at desc);
create index if not exists idx_cortex_usage_owner
  on public.cortex_usage(user_id, created_at desc);

alter table public.cortex_usage enable row level security;

-- Cada um vê o próprio uso; super-admin vê tudo. A ponte grava via service role.
drop policy if exists "cortex_usage_own" on public.cortex_usage;
create policy "cortex_usage_own" on public.cortex_usage
  for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- Realtime: o painel vê o uso/gasto subir em tempo real conforme a ponte executa.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cortex_usage'
  ) then
    alter publication supabase_realtime add table public.cortex_usage;
  end if;
end $$;
