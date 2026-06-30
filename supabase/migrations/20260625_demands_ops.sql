-- ============================================================================
-- Demandas — campos operacionais pro time de agentes operar de verdade
-- ============================================================================
-- Acrescenta à team_demands o que faltava pro Kanban virar central de comando
-- do time de IA: custo/tempo/tokens por demanda (desnormalizado da cortex_usage
-- pela ponte, pra mostrar no card sem join), auto-retry, dependências entre
-- demandas (pipeline), prazo, tags e modo orquestrador (Bukowiski decide/delega).
-- Tudo aditivo e com default — não quebra demanda existente.
-- ============================================================================

alter table public.team_demands
  add column if not exists cost_usd     numeric(10,4) not null default 0,   -- custo real da execução
  add column if not exists duration_ms  int           not null default 0,   -- tempo de execução
  add column if not exists total_tokens int           not null default 0,   -- tokens do turno
  add column if not exists retry_count  int           not null default 0,   -- tentativas já feitas (auto-retry)
  add column if not exists depends_on   uuid[]        not null default '{}', -- só roda quando todas estão 'done'
  add column if not exists due_date     timestamptz,                        -- prazo (opcional)
  add column if not exists tags         text[]        not null default '{}', -- rótulos livres
  add column if not exists orchestrate  boolean       not null default false, -- Bukowiski avalia: executa ou delega/quebra
  add column if not exists started_at   timestamptz,                        -- início da execução (cycle time)
  add column if not exists finished_at  timestamptz;                        -- fim da execução

comment on column public.team_demands.depends_on  is 'demandas que precisam estar done antes desta entrar na fila (pipeline)';
comment on column public.team_demands.orchestrate is 'true = Bukowiski avalia se executa direto ou quebra em sub-demandas e delega';
comment on column public.team_demands.cost_usd    is 'custo real desnormalizado da cortex_usage (gravado pela ponte ao finalizar)';
