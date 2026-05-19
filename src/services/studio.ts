/**
 * Studio canvas — no-code builder com persistência + versionamento.
 */

import { supabase } from '@/lib/supabase';
import type { StudioCanvas, StudioBlock } from '@/lib/seed-studio';

export const studioConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface CanvasRow {
  id: string; workspace_id: string; agent_id: string | null;
  name: string; description: string | null;
  blocks: StudioBlock[]; status: 'draft' | 'published' | 'archived';
  published_at: string | null; published_version: number;
  author: string | null; created_at: string; updated_at: string;
}

function rowToCanvas(r: CanvasRow, agentName?: string): StudioCanvas {
  return {
    id: r.id, agentName: agentName ?? r.name,
    description: r.description ?? '',
    status: r.status === 'archived' ? 'draft' : (r.status as 'draft' | 'published'),
    publishedAt: r.published_at ?? undefined,
    updatedAt: r.updated_at,
    author: r.author ?? '',
    blocksCount: r.blocks?.length ?? 0,
    blocks: r.blocks ?? [],
  };
}

export async function listCanvases(workspaceId: string): Promise<StudioCanvas[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('studio_canvases')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToCanvas(r as CanvasRow));
}

export async function getCanvas(id: string): Promise<StudioCanvas | null> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('studio_canvases')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return rowToCanvas(data as CanvasRow);
}

/**
 * Save automático (debounced no UI). Atualiza só blocks + updated_at.
 */
export async function saveCanvas(id: string, blocks: StudioBlock[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('studio_canvases')
    .update({ blocks })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Publica canvas — snapshot vira versão; trigger materializa o agente real.
 */
export async function publishCanvas(id: string): Promise<{ version: number; publishedAt: string }> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('studio_canvases')
    .update({ status: 'published' })
    .eq('id', id)
    .select('published_version, published_at')
    .single();
  if (error) throw error;
  return {
    version: (data as { published_version: number }).published_version,
    publishedAt: (data as { published_at: string }).published_at,
  };
}

export async function createCanvas(params: {
  workspaceId: string; name: string; description?: string; agentId?: string;
}): Promise<StudioCanvas> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('studio_canvases')
    .insert({
      workspace_id: params.workspaceId,
      name: params.name, description: params.description,
      agent_id: params.agentId, blocks: [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCanvas(data as CanvasRow);
}

export interface CanvasVersion {
  version: number; blocks: StudioBlock[]; publishedAt: string;
}

export async function listVersions(canvasId: string): Promise<CanvasVersion[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('studio_canvas_versions')
    .select('version, blocks, published_at')
    .eq('canvas_id', canvasId)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    version: (r as { version: number }).version,
    blocks: (r as { blocks: StudioBlock[] }).blocks,
    publishedAt: (r as { published_at: string }).published_at,
  }));
}
