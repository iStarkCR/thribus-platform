-- ============================================================================
-- Cortex Memory — espelho da memória de longo prazo dos colaboradores no painel
-- ============================================================================
-- A memória real mora em bukowiski_memory.memory_facts (Postgres do Coolify, VPS),
-- que o painel web NÃO alcança direto. Então, no mesmo padrão do fs_browse_requests,
-- a PONTE (service role, com túnel SSH pro Postgres da VPS) é o intermediário:
--   • PULL  — a ponte espelha os fatos da VPS pra esta tabela (o painel só LÊ).
--   • PUSH  — o painel marca pending_op ('create'|'update'|'delete'); a ponte
--             aplica na VPS e limpa o pending_op (ou remove a linha, no delete).
--
-- remote_id = id em memory_facts (null enquanto o fato ainda não foi criado lá).
-- ============================================================================

create table if not exists public.cortex_memory (
  id          uuid primary key default gen_random_uuid(),
  remote_id   bigint,                                   -- id em bukowiski_memory.memory_facts
  agent_id    text not null,
  category    text,
  entity      text,
  fact        text not null,
  confidence  double precision not null default 0.8,
  active      boolean not null default true,
  pending_op  text check (pending_op in ('create','update','delete')),  -- null = sincronizado
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_cortex_memory_agent on public.cortex_memory(agent_id);
create index if not exists idx_cortex_memory_pending on public.cortex_memory(pending_op) where pending_op is not null;
create unique index if not exists uq_cortex_memory_remote on public.cortex_memory(remote_id) where remote_id is not null;

alter table public.cortex_memory enable row level security;

-- Memória do time interno: só super-admin lê/escreve (a ponte usa service role).
drop policy if exists "cortex_memory_admin" on public.cortex_memory;
create policy "cortex_memory_admin" on public.cortex_memory
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop trigger if exists trg_cortex_memory_touch on public.cortex_memory;
create trigger trg_cortex_memory_touch before update on public.cortex_memory
  for each row execute function public.touch_updated_at();
