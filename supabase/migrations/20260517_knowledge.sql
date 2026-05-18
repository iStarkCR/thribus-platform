-- ============================================================================
-- Migration: Knowledge Base RAG — pgvector + tabelas
-- ============================================================================
-- Permite agente consultar docs do cliente via embeddings semânticos.
-- Edge functions:
--   knowledge-ingest — chunka + embedda + insere
--   knowledge-query  — busca top-k similar
-- ============================================================================

create extension if not exists vector;

-- ─── knowledge_bases ────────────────────────────────────────────────────────
create table if not exists public.knowledge_bases (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  description     text,
  embedding_model text not null default 'text-embedding-3-small',
  chunk_size      integer not null default 800,
  chunk_overlap   integer not null default 120,
  visibility      text not null default 'workspace' check (visibility in ('workspace','private')),
  attached_agent_ids uuid[] default '{}'::uuid[],
  total_chunks    integer not null default 0,
  total_tokens    integer not null default 0,
  size_mb         numeric(10,2) not null default 0,
  query_count_30d integer not null default 0,
  last_query_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_kb_workspace on public.knowledge_bases(workspace_id);

-- ─── knowledge_sources (PDF, URL, sheet, notion) ────────────────────────────
create table if not exists public.knowledge_sources (
  id              uuid primary key default gen_random_uuid(),
  base_id         uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  type            text not null check (type in ('pdf','url','sheet','notion','gdrive','text')),
  title           text not null,
  uri             text not null,
  status          text not null default 'idle' check (status in ('idle','ingesting','ready','failed','stale')),
  chunks_count    integer not null default 0,
  tokens          integer not null default 0,
  error           text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ksources_base on public.knowledge_sources(base_id);

-- ─── knowledge_chunks (com vector) ──────────────────────────────────────────
create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.knowledge_sources(id) on delete cascade,
  base_id         uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  chunk_index     integer not null,
  content         text not null,
  tokens          integer not null default 0,
  embedding       vector(1536),                           -- text-embedding-3-small
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Índice IVF Flat pra busca aproximada de vizinhos próximos (cosine)
create index if not exists idx_kchunks_embedding
  on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists idx_kchunks_base on public.knowledge_chunks(base_id);

-- ─── knowledge_queries (log pra analytics) ──────────────────────────────────
create table if not exists public.knowledge_queries (
  id              uuid primary key default gen_random_uuid(),
  base_id         uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  query           text not null,
  top_k           integer not null default 4,
  hits            integer not null default 0,
  latency_ms      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_kqueries_base_time
  on public.knowledge_queries(base_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_queries enable row level security;

create policy "kb_select" on public.knowledge_bases for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "ksources_select" on public.knowledge_sources for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "kchunks_select" on public.knowledge_chunks for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "kqueries_select" on public.knowledge_queries for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Trigger atualizar contadores na base quando chunks/queries inserem
create or replace function public.bump_kb_counters() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'knowledge_chunks' then
    update public.knowledge_bases
      set total_chunks = total_chunks + 1,
          total_tokens = total_tokens + coalesce(new.tokens, 0),
          updated_at = now()
      where id = new.base_id;
  elsif tg_table_name = 'knowledge_queries' then
    update public.knowledge_bases
      set query_count_30d = query_count_30d + 1,
          last_query_at = now()
      where id = new.base_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kchunks_bump on public.knowledge_chunks;
create trigger trg_kchunks_bump after insert on public.knowledge_chunks
  for each row execute function public.bump_kb_counters();

drop trigger if exists trg_kqueries_bump on public.knowledge_queries;
create trigger trg_kqueries_bump after insert on public.knowledge_queries
  for each row execute function public.bump_kb_counters();

-- ─── RPC: match_knowledge_chunks ────────────────────────────────────────────
-- Busca top-k chunks por similaridade cosseno num base específico.
-- Usada pelo edge function knowledge-query.
create or replace function public.match_knowledge_chunks(
  base_uuid uuid,
  query_embedding vector(1536),
  match_count integer default 4,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity float,
  tokens integer
)
language sql stable
as $$
  select
    c.id, c.source_id, c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    c.tokens
  from public.knowledge_chunks c
  where c.base_id = base_uuid
    and (1 - (c.embedding <=> query_embedding)) > min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
