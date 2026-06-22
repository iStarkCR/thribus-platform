/**
 * Memória semântica — busca por embeddings (pgvector + OpenAI embeddings).
 *
 * 2 escopos:
 *   - Knowledge base (RAG): documentos do tenant
 *   - Message history: busca em conversas passadas
 *
 * Embeddings: text-embedding-3-small (1536 dims) — barato (~$0.02/1M tokens)
 * Degrada graceful se OpenAI key ausente ou extensão pgvector não habilitada.
 */

import { supabase } from '../../db/supabase.js';
import { embeddingCostUsd, logAuxCost } from '../../llm/cost.js';
import { recordAuxUsage } from '../../llm/aux-usage.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

/**
 * Gera embedding via OpenAI API. Retorna null se falhar.
 * Usa fetch direto (sem dependência adicional — openai SDK seria overkill).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.debug('[cortex.semantic] OPENAI_API_KEY ausente — skip embedding');
    return null;
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });
    if (!resp.ok) {
      console.warn(
        `[cortex.semantic] OpenAI embeddings ${resp.status}: ${await resp.text()}`,
      );
      return null;
    }
    const json = (await resp.json()) as OpenAiEmbeddingResponse;
    const embTokens = Math.ceil(text.length / 4); // estimativa (~4 chars/token)
    const embCost = embeddingCostUsd(EMBEDDING_MODEL, embTokens);
    logAuxCost('embedding', EMBEDDING_MODEL, embCost, { tokens: embTokens });
    void recordAuxUsage({ kind: 'embedding', model: EMBEDDING_MODEL, costUsd: embCost, totalTokens: embTokens });
    return json.data[0]?.embedding ?? null;
  } catch (err) {
    console.warn('[cortex.semantic] generateEmbedding ex:', (err as Error).message);
    return null;
  }
}

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === '42883') return true;
  return /relation .* does not exist|function .* does not exist/i.test(
    err.message ?? '',
  );
}

export interface KnowledgeHit {
  id: number;
  title: string | null;
  text: string;
  similarity: number;
  tags: string[];
}

export const semanticMemory = {
  /**
   * Busca documentos relevantes na base de conhecimento do tenant.
   * Retorna [] se: Supabase off, OpenAI off, tabela inexistente, ou
   * nenhum resultado.
   */
  async searchKnowledge(
    tenantId: string,
    query: string,
    limit = 5,
    agentId?: string,
  ): Promise<KnowledgeHit[]> {
    if (!supabase) return [];

    const embedding = await generateEmbedding(query);
    if (!embedding) return [];

    try {
      const { data, error } = await supabase.rpc('cortex_search_knowledge', {
        p_tenant_id: tenantId,
        p_query_embedding: embedding,
        p_limit: limit,
        p_agent_id: agentId ?? null,
      });
      if (error) {
        if (isMissingTableError(error)) return [];
        console.warn('[cortex.semantic] searchKnowledge erro:', error.message);
        return [];
      }
      return (data ?? []).map(
        (r: { id: number; title: string | null; text: string; similarity: number; tags: string[] }) => ({
          id: r.id,
          title: r.title,
          text: r.text,
          similarity: Number(r.similarity ?? 0),
          tags: r.tags ?? [],
        }),
      );
    } catch (err) {
      console.warn('[cortex.semantic] searchKnowledge ex:', (err as Error).message);
      return [];
    }
  },

  /**
   * Adiciona um documento à base de conhecimento (gera embedding antes).
   */
  async addKnowledge(
    tenantId: string,
    doc: {
      title?: string;
      text: string;
      source?: string;
      sourceId?: string;
      chunkIndex?: number;
      tags?: string[];
      agentScope?: string[];
    },
  ): Promise<boolean> {
    if (!supabase) return false;

    const embedding = await generateEmbedding(doc.text);
    if (!embedding) return false;

    try {
      const { error } = await supabase.from('cortex_knowledge').insert({
        tenant_id: tenantId,
        title: doc.title ?? null,
        text: doc.text,
        source: doc.source ?? null,
        source_id: doc.sourceId ?? null,
        chunk_index: doc.chunkIndex ?? 0,
        tags: doc.tags ?? [],
        agent_scope: doc.agentScope ?? [],
        embedding: embedding as unknown as string, // pgvector aceita array
      });
      if (error) {
        if (isMissingTableError(error)) return false;
        console.warn('[cortex.semantic] addKnowledge erro:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[cortex.semantic] addKnowledge ex:', (err as Error).message);
      return false;
    }
  },
};

/** Helper: formata hits de RAG pra injetar no contexto do Brain. */
export function formatRagContext(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return '';
  return [
    '[CONHECIMENTO RELEVANTE (RAG)]',
    ...hits.map(
      (h, i) =>
        `${i + 1}. ${h.title ?? '(sem título)'} (sim=${h.similarity.toFixed(2)})\n   ${h.text.slice(0, 400)}`,
    ),
  ].join('\n');
}

export { EMBEDDING_MODEL, EMBEDDING_DIMS };
