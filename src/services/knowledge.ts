/**
 * Knowledge service — RAG semântico via pgvector.
 *
 * Frontend chama duas edge functions:
 *   knowledge-ingest — sobe doc/url/text e gera chunks
 *   knowledge-query — busca top-k similar
 *
 * Listagem direta da tabela `knowledge_bases` quando Supabase wired.
 */

import { supabase } from '@/lib/supabase';
import type {
  KnowledgeBase, KnowledgeSource, KnowledgeQueryLog,
  KnowledgeSourceType, KnowledgeSourceStatus,
} from '@/lib/seed-knowledge';

export const knowledgeConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface BaseRow {
  id: string; workspace_id: string; name: string; description: string | null;
  embedding_model: string; chunk_size: number; chunk_overlap: number;
  visibility: 'workspace' | 'private';
  attached_agent_ids: string[]; total_chunks: number; total_tokens: number;
  size_mb: number; query_count_30d: number; last_query_at: string | null;
  created_at: string; updated_at: string;
}

interface SourceRow {
  id: string; base_id: string; type: KnowledgeSourceType; title: string; uri: string;
  status: KnowledgeSourceStatus; chunks_count: number; tokens: number;
  error: string | null; last_synced_at: string;
}

function rowToBase(r: BaseRow): KnowledgeBase {
  return {
    id: r.id, workspaceId: r.workspace_id,
    name: r.name, description: r.description ?? '',
    embeddingModel: r.embedding_model, chunkSize: r.chunk_size, chunkOverlap: r.chunk_overlap,
    visibility: r.visibility, attachedAgentIds: r.attached_agent_ids ?? [],
    totalChunks: r.total_chunks, totalTokens: r.total_tokens,
    sizeMB: Number(r.size_mb), queryCount30d: r.query_count_30d,
    lastQueryAt: r.last_query_at ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowToSource(r: SourceRow): KnowledgeSource {
  return {
    id: r.id, baseId: r.base_id, type: r.type, title: r.title, uri: r.uri,
    status: r.status, chunks: r.chunks_count, tokens: r.tokens,
    error: r.error ?? undefined, lastSyncedAt: r.last_synced_at,
  };
}

export async function listBases(workspaceId: string): Promise<KnowledgeBase[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToBase(r as BaseRow));
}

export async function listSources(baseId: string): Promise<KnowledgeSource[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('knowledge_sources')
    .select('*')
    .eq('base_id', baseId)
    .order('last_synced_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSource(r as SourceRow));
}

export async function listRecentQueries(baseId: string, limit = 10): Promise<KnowledgeQueryLog[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('knowledge_queries')
    .select('*')
    .eq('base_id', baseId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, baseId: r.base_id as string,
    agentId: (r.agent_id as string) ?? undefined,
    query: r.query as string, topK: r.top_k as number,
    hits: r.hits as number, latencyMs: r.latency_ms as number,
    timestamp: r.created_at as string,
  }));
}

export async function ingestText(params: {
  workspaceId: string; baseId: string;
  source: { type: KnowledgeSourceType; title: string; uri: string };
  text: string;
}): Promise<{ source_id: string; chunks: number; tokens: number }> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('knowledge-ingest', {
    body: {
      workspace_id: params.workspaceId,
      base_id: params.baseId,
      source: params.source,
      text: params.text,
    },
  });
  if (error) throw error;
  return data as { source_id: string; chunks: number; tokens: number };
}

export interface RagHit {
  id: string; source_id: string; content: string; similarity: number; tokens: number;
}

export async function queryKnowledge(params: {
  workspaceId: string; baseId: string; query: string;
  topK?: number; minSimilarity?: number; agentId?: string;
}): Promise<{ hits: RagHit[]; latency_ms: number }> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('knowledge-query', {
    body: {
      workspace_id: params.workspaceId,
      base_id: params.baseId,
      query: params.query,
      top_k: params.topK ?? 4,
      min_similarity: params.minSimilarity ?? 0.3,
      agent_id: params.agentId,
    },
  });
  if (error) throw error;
  return data as { hits: RagHit[]; latency_ms: number };
}
