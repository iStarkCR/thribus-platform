-- ══════════════════════════════════════════════════════
-- Migration 011 — Cortex Memory (Fase 1)
-- ══════════════════════════════════════════════════════
-- Memória de longo prazo do Brain. 3 tabelas:
--
-- 1. cortex_entity_memory  → perfil consolidado por entidade
--    (tenant_id + entity_type + entity_id é a chave)
--
-- 2. cortex_facts          → fatos discretos aprendidos
--    (ex: "cliente prefere atendimento em horário comercial")
--
-- 3. cortex_session_summaries → resumos de sessões longas
--    (gerados via job de consolidação)
--
-- A memória semântica (vector embeddings) virá em migration separada
-- na Fase 2 com pgvector.
-- ══════════════════════════════════════════════════════

-- ─── 1. Perfil consolidado da entidade ───────────────────────────────────
create table if not exists cortex_entity_memory (
  id              bigserial primary key,
  tenant_id       text not null,
  entity_type     text not null,
  entity_id       text not null,

  -- Perfil em texto livre (consolidado pelo Brain — substituível)
  profile_text    text not null default '',

  -- Atributos estruturados (livre — sobrescrevíveis)
  attrs           jsonb not null default '{}'::jsonb,

  -- Stats
  total_sessions  integer not null default 0,
  total_messages  integer not null default 0,
  last_seen_at    timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, entity_type, entity_id)
);

create index if not exists cortex_entity_memory_tenant_idx
  on cortex_entity_memory(tenant_id, updated_at desc);

-- ─── 2. Fatos discretos sobre a entidade ──────────────────────────────────
create table if not exists cortex_facts (
  id              bigserial primary key,
  tenant_id       text not null,
  entity_type     text not null,
  entity_id       text not null,

  -- Texto do fato (1 linha — algo factual e útil)
  fact_text       text not null,

  -- Categoria livre (preference, history, risk, opportunity…)
  category        text,

  -- Confiança 0..1 (Brain decide ao gravar)
  confidence      numeric(4,3) not null default 0.5,

  -- Origem — session_id que gerou esse fato
  source_session  text,

  -- Validade (null = permanente; data = expira)
  valid_until     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_facts_entity_idx
  on cortex_facts(tenant_id, entity_type, entity_id, created_at desc);

create index if not exists cortex_facts_category_idx
  on cortex_facts(tenant_id, category) where category is not null;

-- ─── 3. Resumos de sessões consolidadas ──────────────────────────────────
create table if not exists cortex_session_summaries (
  id              bigserial primary key,
  tenant_id       text not null,
  session_id      text not null,
  entity_type     text,
  entity_id       text,

  -- Resumo da sessão
  summary_text    text not null,

  -- Top intents detectados
  top_intents     text[] not null default '{}',

  -- Agentes envolvidos
  agents_involved text[] not null default '{}',

  -- Stats da sessão original
  message_count   integer not null default 0,
  total_cost_usd  numeric(10,6) not null default 0,

  created_at      timestamptz not null default now()
);

create index if not exists cortex_session_summaries_tenant_idx
  on cortex_session_summaries(tenant_id, created_at desc);

create index if not exists cortex_session_summaries_entity_idx
  on cortex_session_summaries(tenant_id, entity_type, entity_id, created_at desc)
  where entity_id is not null;

comment on table cortex_entity_memory is
  'Cortex Brain — perfil consolidado por entidade (cliente/lead/account).';
comment on table cortex_facts is
  'Cortex Brain — fatos discretos aprendidos sobre uma entidade.';
comment on table cortex_session_summaries is
  'Cortex Brain — resumos consolidados de sessões pra alimentar contexto futuro.';
