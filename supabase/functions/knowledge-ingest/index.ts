/**
 * Edge Function: knowledge-ingest
 *
 * Recebe texto (já extraído de PDF/URL/sheet no cliente ou via outro tool),
 * faz chunking + embedding (OpenAI) e insere em knowledge_chunks.
 *
 * Setup:
 *   supabase secrets set OPENAI_API_KEY=sk-xxx
 *   supabase functions deploy knowledge-ingest
 *
 * Body:
 *   {
 *     workspace_id: uuid,
 *     base_id: uuid,
 *     source: { type, title, uri },
 *     text: "...conteúdo extraído..."
 *   }
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

interface IngestBody {
  workspace_id: string;
  base_id: string;
  source: { type: 'pdf' | 'url' | 'sheet' | 'notion' | 'gdrive' | 'text'; title: string; uri: string };
  text: string;
  chunk_size?: number;
  chunk_overlap?: number;
}

// Chunking simples por tamanho de chars (com overlap)
function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    chunks.push(clean.slice(start, start + size));
    start += (size - overlap);
  }
  return chunks;
}

// Embed via OpenAI
async function embed(input: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  });
  if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// Estima tokens (~4 chars/token aproximado)
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const body = await req.json() as IngestBody;
    const { workspace_id, base_id, source, text } = body;

    // 1. Cria source com status ingesting
    const { data: srcRow, error: srcErr } = await db
      .from('knowledge_sources')
      .insert({
        base_id, workspace_id,
        type: source.type, title: source.title, uri: source.uri,
        status: 'ingesting',
      })
      .select('id')
      .single();
    if (srcErr) throw srcErr;
    const sourceId = (srcRow as { id: string }).id;

    // 2. Chunk
    const chunks = chunkText(text, body.chunk_size ?? 800, body.chunk_overlap ?? 120);
    console.log(`[knowledge-ingest] ${chunks.length} chunks from ${text.length} chars`);

    // 3. Embed em batch (max 100 por chamada na API)
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const embs = await embed(batch);
      allEmbeddings.push(...embs);
    }

    // 4. Insere chunks
    const totalTokens = chunks.reduce((s, c) => s + estimateTokens(c), 0);
    const rows = chunks.map((content, idx) => ({
      source_id: sourceId,
      base_id,
      workspace_id,
      chunk_index: idx,
      content,
      tokens: estimateTokens(content),
      embedding: allEmbeddings[idx],
    }));

    const { error: chunkErr } = await db.from('knowledge_chunks').insert(rows);
    if (chunkErr) throw chunkErr;

    // 5. Atualiza source status + counters
    await db
      .from('knowledge_sources')
      .update({
        status: 'ready',
        chunks_count: chunks.length,
        tokens: totalTokens,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', sourceId);

    return new Response(JSON.stringify({
      source_id: sourceId,
      chunks: chunks.length,
      tokens: totalTokens,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[knowledge-ingest]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
