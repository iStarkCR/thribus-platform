-- ══════════════════════════════════════════════════════
-- Migration 013 — Cortex Semantic Memory (Fase 2)
-- ══════════════════════════════════════════════════════
-- Memória semântica do Brain via pgvector.
--
-- 2 tabelas:
--   1. cortex_knowledge      → documentos/conhecimento do tenant (RAG)
--   2. cortex_message_vectors → conversas indexadas (busca por similaridade)
--
-- IMPORTANTE: requer extensão pgvector. No Supabase já vem habilitada.
-- Em outros Postgres: CREATE EXTENSION IF NOT EXISTS vector;
--
-- Embeddings: OpenAI text-embedding-3-small (1536 dims) — barato + bom.
-- Pode ser sobrescrito por modelo per-tenant na Fase 3.
-- ══════════════════════════════════════════════════════

create extension if not exists vector;

-- ─── 1. Knowledge base do tenant (RAG) ────────────────────────────────────
create table if not exists cortex_knowledge (
  id              bigserial primary key,
  tenant_id       text not null,

  -- Metadados do documento
  source          text,                    -- 'manual', 'gdrive:doc-id', 'notion:page-id'
  source_id       text,
  title           text,

  -- Chunk
  chunk_index     integer not null default 0,
  text            text not null,
  embedding       vector(1536),

  -- Tags livres pra filtro (categoria, idioma, agent específico)
  tags            text[] not null default '{}',

  -- Override de qual agente pode usar (vazio = todos)
  agent_scope     text[] not null default '{}',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cortex_knowledge_tenant_idx
  on cortex_knowledge(tenant_id);

create index if not exists cortex_knowledge_tags_idx
  on cortex_knowledge using gin(tags);

-- IVFFlat index pra busca por similaridade (cosine)
-- lists=100 é ok pra <100k rows; escalar se crescer
create index if not exists cortex_knowledge_embedding_idx
  on cortex_knowledge using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── 2. Mensagens indexadas (busca semântica em histórico) ────────────────
create table if not exists cortex_message_vectors (
  id              bigserial primary key,
  tenant_id       text not null,
  session_id      text not null,

  -- Entidade alvo (pra filtrar por cliente)
  entity_type     text,
  entity_id       text,

  role            text not null,
  text            text not null,
  embedding       vector(1536),

  created_at      timestamptz not null default now()
);

create index if not exists cortex_message_vectors_tenant_idx
  on cortex_message_vectors(tenant_id, created_at desc);

create index if not exists cortex_message_vectors_entity_idx
  on cortex_message_vectors(tenant_id, entity_type, entity_id, created_at desc)
  where entity_id is not null;

create index if not exists cortex_message_vectors_embedding_idx
  on cortex_message_vectors using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── 3. Helper functions de busca ─────────────────────────────────────────
-- Search knowledge by similarity
create or replace function cortex_search_knowledge(
  p_tenant_id text,
  p_query_embedding vector(1536),
  p_limit int default 5,
  p_agent_id text default null
) returns table (
  id bigint,
  title text,
  text text,
  similarity float,
  tags text[]
) language sql stable as $$
  select
    k.id, k.title, k.text,
    1 - (k.embedding <=> p_query_embedding) as similarity,
    k.tags
  from cortex_knowledge k
  where k.tenant_id = p_tenant_id
    and (
      p_agent_id is null
      or array_length(k.agent_scope, 1) is null
      or p_agent_id = any(k.agent_scope)
    )
  order by k.embedding <=> p_query_embedding
  limit p_limit;
$$;

comment on table cortex_knowledge is
  'Cortex Brain — base de conhecimento do tenant (RAG via pgvector).';
comment on table cortex_message_vectors is
  'Cortex Brain — mensagens vetorizadas pra busca semântica em histórico.';
