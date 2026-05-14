-- ══════════════════════════════════════════════════════
-- Migration 010 — Cortex Audit Log (Fase 0)
-- ══════════════════════════════════════════════════════
-- Trilha de auditoria das chamadas ao Cortex Brain.
-- Cada chamada gera 1 linha com:
--   - tenant_id        → quem chamou
--   - session_id       → contexto da sessão
--   - trace_id         → id único pra debug (X-Trace-Id)
--   - input/output     → texto da request/response (truncado)
--   - selected_agent   → quem o Brain escolheu
--   - intent/confidence/reasoning  → decisão do analyzer
--   - usage (tokens)   → custo
--
-- Volume esperado: 1 linha por POST /cortex/analyze.
-- Retenção: 90 dias (cleanup via cron).
--
-- Idempotente.
-- ══════════════════════════════════════════════════════

create table if not exists cortex_audit_log (
  id              bigserial primary key,
  tenant_id       text not null,
  session_id      text not null,
  trace_id        text not null,
  channel         text,

  -- Entidade alvo (opcional)
  entity_type     text,
  entity_id       text,

  -- Input do caller
  input_text      text not null,
  input_chars     integer not null,

  -- Decisão do analyzer
  selected_agent  text,
  intent          text,
  confidence      numeric(4,3),
  reasoning       text,

  -- Output consolidado
  reply_text      text,
  actions_count   integer not null default 0,
  insights_count  integer not null default 0,

  -- Métricas
  input_tokens          integer not null default 0,
  output_tokens         integer not null default 0,
  cache_read_tokens     integer not null default 0,
  estimated_cost_usd    numeric(10,6) not null default 0,
  latency_ms            integer not null default 0,
  model                 text,

  -- Status
  status          text not null default 'ok',  -- 'ok' | 'error' | 'blocked'
  error_message   text,

  created_at      timestamptz not null default now()
);

create index if not exists cortex_audit_tenant_idx
  on cortex_audit_log(tenant_id, created_at desc);

create index if not exists cortex_audit_session_idx
  on cortex_audit_log(session_id, created_at desc);

create index if not exists cortex_audit_trace_idx
  on cortex_audit_log(trace_id);

create index if not exists cortex_audit_agent_idx
  on cortex_audit_log(selected_agent, created_at desc)
  where selected_agent is not null;

comment on table cortex_audit_log is
  'Cortex Brain — audit log de toda chamada ao /cortex/analyze. Append-only.';
