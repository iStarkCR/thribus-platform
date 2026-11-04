-- ───────────────────────────────────────────────────────────────────────────
-- Agregador de métricas dos colaboradores: executions → agents.stats_*
--
-- Problema: o painel lê os campos stats_* de `agents`, mas nada agrega a tabela
-- `executions` (atividade real) pra lá → métricas ficam zeradas ("—").
--
-- ⚠️ Esta migration ESCREVE nos agentes de produção (snapshot inicial).
--    APLICAR SOMENTE APÓS 19h BRT (operação em pico antes disso).
-- ───────────────────────────────────────────────────────────────────────────

-- Agregador: recalcula stats_* do dia (fuso America/Fortaleza) a partir de executions.
create or replace function public.refresh_agent_stats() returns void language plpgsql as $$
begin
  -- (1) agentes COM atividade hoje
  update agents a set
    stats_today             = x.total,
    stats_resolution        = x.res_pct,
    stats_avg_response_time = x.avg_s,
    stats_escalated         = x.escal,
    updated_at              = now()
  from (
    select agent_id,
      count(*) as total,
      round(100.0 * count(*) filter (where status = 'resolved') / nullif(count(*),0))::int as res_pct,
      round(avg(response_time_ms) / 1000.0, 2) as avg_s,
      count(*) filter (where status = 'escalated')::int as escal
    from executions
    where (created_at at time zone 'America/Fortaleza')::date
        = (now() at time zone 'America/Fortaleza')::date
    group by agent_id
  ) x
  where a.id = x.agent_id;

  -- (2) reset dos sem atividade hoje (mantém "HOJE" correto após a virada do dia)
  update agents set
    stats_today = 0, stats_resolution = 0, stats_avg_response_time = 0, stats_escalated = 0, updated_at = now()
  where (stats_today <> 0 or stats_resolution <> 0 or stats_avg_response_time <> 0 or stats_escalated <> 0)
    and id not in (
      select distinct agent_id from executions
      where (created_at at time zone 'America/Fortaleza')::date
          = (now() at time zone 'America/Fortaleza')::date
    );
end $$;

-- Snapshot imediato (1ª escrita — só executa quando esta migration rodar, após 19h).
select public.refresh_agent_stats();

-- Job recorrente a cada 10min (mantém as métricas vivas, com reset diário automático).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'refresh-agent-stats') then
    perform cron.unschedule('refresh-agent-stats');
  end if;
end $$;
select cron.schedule('refresh-agent-stats', '*/10 * * * *', 'select public.refresh_agent_stats();');
