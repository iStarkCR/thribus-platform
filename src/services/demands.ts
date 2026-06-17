/**
 * Demandas do time Thribus — fila que o Bukowiski/time executa.
 * O painel cria/move; o daemon (service role) processa as 'todo'.
 */
import { supabase } from '@/lib/supabase';

export type DemandStatus = 'todo' | 'doing' | 'waiting' | 'done' | 'error';

export interface Demand {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  description: string | null;
  project: string | null;
  status: DemandStatus;
  priority: number;
  result: string | null;
  error: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const demandsConfigured = Boolean(supabase);

interface Row {
  id: string; user_id: string; agent_id: string; title: string;
  description: string | null; project: string | null; status: DemandStatus;
  priority: number; result: string | null; error: string | null;
  parent_id: string | null; created_at: string; updated_at: string;
}

const toDemand = (r: Row): Demand => ({
  id: r.id, userId: r.user_id, agentId: r.agent_id, title: r.title,
  description: r.description, project: r.project, status: r.status,
  priority: r.priority, result: r.result, error: r.error,
  parentId: r.parent_id, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function listDemands(_userId: string): Promise<Demand[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('team_demands')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toDemand); // RLS já filtra por usuário / super-admin
}

export async function createDemand(
  userId: string,
  input: { title: string; description?: string; project?: string; agentId?: string; priority?: number; parentId?: string },
): Promise<Demand> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('team_demands')
    .insert({
      user_id: userId,
      agent_id: input.agentId ?? 'bukowiski-thribus',
      title: input.title,
      description: input.description ?? null,
      project: input.project ?? null,
      priority: input.priority ?? 0,
      parent_id: input.parentId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toDemand(data as Row);
}

/**
 * Responde ao Bukowiski numa demanda concluída ("OK, pode publicar"): cria uma
 * demanda-filho que entra na fila e é executada COM o contexto da anterior
 * (a ponte busca o resultado do pai via parent_id). É o aceite virando tarefa.
 */
export async function replyDemand(userId: string, parent: Demand, text: string): Promise<Demand> {
  return createDemand(userId, {
    title: `Re: ${parent.title}`.slice(0, 140),
    description: text,
    project: parent.project ?? undefined,
    agentId: parent.agentId,
    priority: Math.max(5, parent.priority),
    parentId: parent.id,
  });
}

export async function updateDemand(
  id: string,
  patch: { status?: DemandStatus; title?: string; description?: string | null; project?: string | null; agentId?: string; priority?: number },
): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.project !== undefined) row.project = patch.project;
  if (patch.agentId !== undefined) row.agent_id = patch.agentId;
  if (patch.priority !== undefined) row.priority = patch.priority;
  const { error } = await supabase.from('team_demands').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteDemand(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('team_demands').delete().eq('id', id);
  if (error) throw error;
}

/** Realtime — o Kanban vê as demandas moverem sozinhas (todo→doing→done). */
let demandsSeq = 0;
export function subscribeDemands(userId: string, onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`team-demands:${userId}:${++demandsSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_demands' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
