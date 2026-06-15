/**
 * Setores (organograma) — departamentos de uma empresa/workspace.
 * Cada colaborador (agent) liga a um setor via sector_id.
 */

import { supabase } from '@/lib/supabase';
import type { Sector } from '@/types';

interface SectorRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number | null;
}

export async function listSectors(workspaceId?: string | null): Promise<Sector[]> {
  if (!supabase) return [];
  let query = supabase.from('sectors').select('*').order('sort_order', { ascending: true });
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as SectorRow[]).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? undefined,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    sortOrder: r.sort_order ?? 0,
  }));
}
