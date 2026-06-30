/**
 * Memória de longo prazo dos colaboradores — lado do painel.
 *
 * A memória real vive em bukowiski_memory.memory_facts (Postgres da VPS), que o
 * painel não alcança. O painel lê/escreve no ESPELHO `cortex_memory` (Supabase) e a
 * ponte sincroniza com a VPS (ver scripts/memory.mjs + tickMemorySync na ponte).
 * Edições marcam `pending_op`; a ponte aplica e limpa. Por isso uma linha pode estar
 * "sincronizando" (pendingOp != null) até a ponte processar.
 */

import { supabase } from '@/lib/supabase';

export interface MemoryFact {
  id: string;
  remoteId: number | null;
  agentId: string;
  category: string | null;
  entity: string | null;
  fact: string;
  confidence: number;
  active: boolean;
  pendingOp: 'create' | 'update' | 'delete' | null;
  syncedAt: string | null;
  updatedAt: string;
}

export const memoryConfigured = Boolean(supabase);

interface Row {
  id: string;
  remote_id: number | null;
  agent_id: string;
  category: string | null;
  entity: string | null;
  fact: string;
  confidence: number;
  active: boolean;
  pending_op: 'create' | 'update' | 'delete' | null;
  synced_at: string | null;
  updated_at: string;
}

const toFact = (r: Row): MemoryFact => ({
  id: r.id,
  remoteId: r.remote_id,
  agentId: r.agent_id,
  category: r.category,
  entity: r.entity,
  fact: r.fact,
  confidence: r.confidence,
  active: r.active,
  pendingOp: r.pending_op,
  syncedAt: r.synced_at,
  updatedAt: r.updated_at,
});

/** Fatos de um colaborador (esconde os marcados pra deleção). */
export async function listMemory(agentId: string): Promise<MemoryFact[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cortex_memory')
    .select('*')
    .eq('agent_id', agentId)
    .order('active', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Row[]).filter((r) => r.pending_op !== 'delete').map(toFact);
}

export async function addMemory(
  agentId: string,
  fields: { fact: string; category?: string | null; entity?: string | null; confidence?: number },
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('cortex_memory').insert({
    agent_id: agentId,
    fact: fields.fact.trim(),
    category: fields.category ?? null,
    entity: fields.entity ?? null,
    confidence: fields.confidence ?? 0.9,
    active: true,
    pending_op: 'create', // a ponte cria na VPS e preenche o remote_id
  });
  if (error) throw error;
}

export async function updateMemory(
  id: string,
  fields: Partial<Pick<MemoryFact, 'fact' | 'category' | 'entity' | 'active' | 'confidence'>>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const patch: Record<string, unknown> = { pending_op: 'update' };
  if (fields.fact !== undefined) patch.fact = fields.fact.trim();
  if (fields.category !== undefined) patch.category = fields.category;
  if (fields.entity !== undefined) patch.entity = fields.entity;
  if (fields.active !== undefined) patch.active = fields.active;
  if (fields.confidence !== undefined) patch.confidence = fields.confidence;
  const { error } = await supabase.from('cortex_memory').update(patch).eq('id', id);
  if (error) throw error;
}

/** Remove: se nunca sincronizou (remoteId null) apaga já; senão marca pra ponte apagar na VPS. */
export async function removeMemory(id: string, remoteId: number | null): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  if (remoteId == null) {
    const { error } = await supabase.from('cortex_memory').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('cortex_memory').update({ pending_op: 'delete' }).eq('id', id);
  if (error) throw error;
}
