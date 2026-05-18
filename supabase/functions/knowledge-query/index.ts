/**
 * Edge Function: knowledge-query
 *
 * Busca semântica top-k num knowledge base. Recebe query em texto,
 * gera embedding, chama RPC match_knowledge_chunks no Supabase.
 *
 * Body:
 *   { workspace_id, base_id, query, top_k?, min_similarity?, agent_id? }
 *
 * Retorna:
 *   { hits: [{ source_id, content, similarity, tokens }], latency_ms }
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// @ts-expect-error
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function embed(input: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  });
  if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

interface QueryBody {
  workspace_id: string;
  base_id: string;
  query: string;
  top_k?: number;
  min_similarity?: number;
  agent_id?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const t0 = Date.now();

  try {
    const body = await req.json() as QueryBody;
    const { workspace_id, base_id, query, top_k = 4, min_similarity = 0.3, agent_id } = body;

    // 1. Embed query
    const queryEmbedding = await embed(query);

    // 2. RPC search
    const { data, error } = await db.rpc('match_knowledge_chunks', {
      base_uuid: base_id,
      query_embedding: queryEmbedding,
      match_count: top_k,
      min_similarity,
    });

    if (error) throw error;

    const latency_ms = Date.now() - t0;
    const hits = (data ?? []) as Array<{ id: string; source_id: string; content: string; similarity: number; tokens: number }>;

    // 3. Log query
    await db.from('knowledge_queries').insert({
      base_id, workspace_id, agent_id: agent_id ?? null,
      query, top_k, hits: hits.length, latency_ms,
    });

    return new Response(JSON.stringify({ hits, latency_ms }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[knowledge-query]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
