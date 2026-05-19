-- ============================================================================
-- Migration: A/B Tests — experimentos com significância estatística
-- ============================================================================

create table if not exists public.experiments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  name            text not null,
  hypothesis      text,
  primary_metric  text not null check (primary_metric in ('conversion','csat','first_response','resolution_rate')),
  status          text not null default 'draft' check (status in ('draft','running','concluded','archived')),
  winner          text,                                   -- 'A','B','tie',null
  significance    numeric(4,3) default 0,
  duration_days   integer not null default 7,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_experiments_workspace_status
  on public.experiments(workspace_id, status);

create table if not exists public.experiment_variants (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid not null references public.experiments(id) on delete cascade,
  label           text not null,                          -- 'A','B','C'
  prompt_version_id text,                                 -- pode referenciar versões externas
  prompt_version_label text,
  traffic_share   integer not null default 50 check (traffic_share between 0 and 100),
  created_at      timestamptz not null default now(),
  unique (experiment_id, label)
);

-- Exposição (cada execução do agente sob experimento gera uma row)
create table if not exists public.experiment_exposures (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid not null references public.experiments(id) on delete cascade,
  variant_id      uuid not null references public.experiment_variants(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.inbox_conversations(id) on delete cascade,
  execution_id    uuid references public.executions(id) on delete cascade,
  success         boolean,                                -- conversion outcome
  latency_ms      integer,
  cost_usd        numeric(10,5),
  created_at      timestamptz not null default now()
);

create index if not exists idx_exposures_experiment
  on public.experiment_exposures(experiment_id, created_at desc);
create index if not exists idx_exposures_variant
  on public.experiment_exposures(variant_id);

drop trigger if exists trg_experiments_touch on public.experiments;
create trigger trg_experiments_touch
  before update on public.experiments
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.experiments enable row level security;
alter table public.experiment_variants enable row level security;
alter table public.experiment_exposures enable row level security;

create policy "experiments_select" on public.experiments for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "experiments_write" on public.experiments for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "variants_select" on public.experiment_variants for select
  using (experiment_id in (select id from public.experiments
    where workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())));

create policy "exposures_select" on public.experiment_exposures for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- ─── View: stats agregados por variante ─────────────────────────────────────
create or replace view public.experiment_variant_stats as
select
  v.experiment_id,
  v.id as variant_id,
  v.label,
  v.prompt_version_label,
  v.traffic_share,
  count(e.*) as exposures,
  count(e.*) filter (where e.success = true) as successes,
  coalesce(avg(case when e.success then 1.0 else 0.0 end), 0)::numeric(4,3) as conversion_rate,
  coalesce(avg(e.latency_ms), 0)::integer as avg_latency_ms,
  coalesce(avg(e.cost_usd), 0)::numeric(10,5) as avg_cost
from public.experiment_variants v
left join public.experiment_exposures e on e.variant_id = v.id
group by v.experiment_id, v.id, v.label, v.prompt_version_label, v.traffic_share;

-- ─── RPC: significância estatística (proporção via z-score aprox) ──────────
-- Compara variantes A e B, retorna p-value aproximado e vencedor.
create or replace function public.experiment_significance(exp_id uuid)
returns table (
  variant_a text, variant_b text,
  rate_a numeric, rate_b numeric,
  lift numeric, z_score numeric, significance numeric,
  winner text
)
language plpgsql stable as $$
declare
  a record; b record;
  p_pool numeric; se numeric; z numeric;
begin
  select * into a from public.experiment_variant_stats where experiment_id = exp_id and label = 'A' limit 1;
  select * into b from public.experiment_variant_stats where experiment_id = exp_id and label = 'B' limit 1;
  if a is null or b is null or a.exposures = 0 or b.exposures = 0 then
    return;
  end if;
  p_pool := (a.successes + b.successes)::numeric / (a.exposures + b.exposures);
  se := sqrt(p_pool * (1 - p_pool) * (1.0/a.exposures + 1.0/b.exposures));
  if se = 0 then return; end if;
  z := (b.conversion_rate - a.conversion_rate) / se;
  return query select
    a.label, b.label,
    a.conversion_rate, b.conversion_rate,
    case when a.conversion_rate > 0
      then ((b.conversion_rate - a.conversion_rate) / a.conversion_rate * 100)::numeric(6,2)
      else 0::numeric end,
    z::numeric(6,3),
    -- Significância: 1 - 2*(1-Φ(|z|)). Aproximação simples:
    least(0.999, greatest(0,
      case
        when abs(z) >= 2.58 then 0.99
        when abs(z) >= 1.96 then 0.95
        when abs(z) >= 1.64 then 0.90
        else (abs(z) / 1.96 * 0.95)
      end))::numeric(4,3),
    case
      when abs(z) < 1.64 then 'pending'
      when z > 0 then b.label
      else a.label
    end;
end;
$$;

-- ─── Helper: pick variante pra uma conversa (sticky por hash) ──────────────
create or replace function public.pick_experiment_variant(exp_id uuid, conv_id uuid)
returns uuid
language plpgsql stable as $$
declare
  hash_int bigint;
  variants record;
  cumulative integer := 0;
  pick integer;
begin
  -- Hash determinístico
  hash_int := ('x' || substr(md5(exp_id::text || conv_id::text), 1, 8))::bit(32)::bigint;
  pick := (hash_int % 100)::integer;
  if pick < 0 then pick := pick + 100; end if;

  for variants in
    select id, traffic_share from public.experiment_variants
    where experiment_id = exp_id order by label
  loop
    cumulative := cumulative + variants.traffic_share;
    if pick < cumulative then return variants.id; end if;
  end loop;
  return null;
end;
$$;
