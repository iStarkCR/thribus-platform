/**
 * Cost analytics — agrega de `executions` no Supabase.
 *
 * Quando Supabase configurado, calcula custo real (input/output tokens *
 * pricing por modelo). Sem Supabase, devolve mock do seed-governance.
 */

import { supabase } from '@/lib/supabase';
import { estimateCost } from '@/lib/pricing';

export interface AgentCostReal {
  agentId: string;
  agentName: string;
  conversations30d: number;
  tokensIn: number;
  tokensOut: number;
  llmCost: number;
  cacheReadTokens: number;
}

export const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

export async function fetchAgentCosts(workspaceId: string, days = 30): Promise<AgentCostReal[]> {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase não configurado — fallback mock');

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('executions')
    .select('agent_id, agents(name), tokens_in, tokens_out, cache_read_tokens, model, cost')
    .gte('created_at', cutoff)
    .eq('workspace_id', workspaceId);

  if (error) throw error;

  // Agrupa por agent_id
  const grouped = new Map<string, AgentCostReal>();
  for (const row of (data ?? []) as Array<{ agent_id: string; agents: { name: string } | { name: string }[]; tokens_in: number; tokens_out: number; cache_read_tokens?: number; model?: string; cost?: number }>) {
    const id = row.agent_id;
    const agentName = Array.isArray(row.agents) ? (row.agents[0]?.name ?? id) : (row.agents?.name ?? id);
    const curr = grouped.get(id) ?? {
      agentId: id, agentName, conversations30d: 0,
      tokensIn: 0, tokensOut: 0, llmCost: 0, cacheReadTokens: 0,
    };
    curr.conversations30d += 1;
    curr.tokensIn += row.tokens_in ?? 0;
    curr.tokensOut += row.tokens_out ?? 0;
    curr.cacheReadTokens += row.cache_read_tokens ?? 0;
    const total = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    curr.llmCost += row.cost ?? estimateCost(total, row.model, row.cache_read_tokens ?? 0);
    grouped.set(id, curr);
  }
  return Array.from(grouped.values());
}
