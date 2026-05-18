/**
 * Activity service — feed real-time da operação.
 *
 * Reusa a tabela `executions` (e `escalations`) que já existem.
 * Cada row vira um ActivityEvent normalizado.
 */

import { supabase } from '@/lib/supabase';
import type { ActivityEvent, ActivityType } from '@/lib/seed-final';

export const activityConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface ExecutionRow {
  id: string;
  agent_id: string | null;
  agents: { name: string } | { name: string }[] | null;
  customer_name?: string | null;
  status: 'resolved' | 'escalated' | 'failed' | 'running';
  cost: number | null;
  tokens_used: number | null;
  response_time: number | null;
  tools_used: string[] | null;
  created_at: string;
}

function pickAgentName(r: ExecutionRow): string | undefined {
  if (!r.agents) return undefined;
  return Array.isArray(r.agents) ? r.agents[0]?.name : r.agents.name;
}

function executionToActivity(r: ExecutionRow): ActivityEvent {
  const agentName = pickAgentName(r);
  let type: ActivityType = 'agent_replied';
  let title = 'Resposta gerada';
  let detail = `${r.tokens_used ?? 0} tokens · ${(r.response_time ?? 0).toFixed(1)}s`;
  let value: string | undefined;

  if (r.status === 'escalated') {
    type = 'escalation';
    title = 'Conversa escalada';
    detail = `Status: escalated — humano assume`;
  } else if (r.status === 'failed') {
    type = 'tool_executed';
    title = 'Tool falhou';
    detail = (r.tools_used ?? []).join(', ') || 'tool desconhecida';
  } else if (r.tools_used && r.tools_used.length > 0) {
    type = 'tool_executed';
    title = 'Tool executada';
    detail = `${r.tools_used.join(', ')} · ${(r.response_time ?? 0).toFixed(1)}s`;
  }

  if (r.cost && r.cost > 0) {
    value = `US$ ${r.cost.toFixed(3)}`;
  }

  return {
    id: r.id,
    type,
    title,
    detail,
    agentName,
    customerName: r.customer_name ?? undefined,
    value,
    timestamp: r.created_at,
  };
}

export async function listRecentActivity(workspaceId: string, limit = 100): Promise<ActivityEvent[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('executions')
    .select('id, agent_id, agents(name), customer_name, status, cost, tokens_used, response_time, tools_used, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => executionToActivity(r as unknown as ExecutionRow));
}

export function subscribeActivity(workspaceId: string, onInsert: (e: ActivityEvent) => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`activity:${workspaceId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'executions', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => onInsert(executionToActivity(payload.new as unknown as ExecutionRow)),
    )
    .subscribe();
  return () => { supabase!.removeChannel(ch); };
}
