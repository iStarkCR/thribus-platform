/**
 * Orquestração — router rules, workflows declarativos, handoffs e decision traces.
 *
 * Rules/workflows são editáveis pelo painel; handoffs e traces são
 * produzidos pelo worker (service role) e aqui só lidos.
 */

import { supabase } from '@/lib/supabase';
import { logAudit } from '@/services/governance';
import type {
  RouterRule, Workflow, WorkflowStep, WorkflowTriggerType,
  AgentHandoff, DecisionTrace, DecisionTraceStep,
} from '@/lib/seed-orchestration';

export const orchestrationConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface RuleRow {
  id: string; workspace_id: string; name: string; intent: string; matcher: string;
  target_agent_id: string; priority: number; enabled: boolean;
  hits_30d: number; precision_pct: number;
  agents: { name: string } | null;
}

export async function listRouterRules(workspaceId: string): Promise<RouterRule[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('router_rules')
    .select('id, workspace_id, name, intent, matcher, target_agent_id, priority, enabled, hits_30d, precision_pct, agents(name)')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as RuleRow;
    return {
      id: row.id, workspaceId: row.workspace_id, name: row.name,
      intent: row.intent, matcher: row.matcher,
      targetAgentId: row.target_agent_id,
      targetAgentName: row.agents?.name ?? row.target_agent_id,
      priority: row.priority, enabled: row.enabled,
      hits30d: row.hits_30d, precision: Number(row.precision_pct),
    };
  });
}

export async function toggleRouterRule(id: string, enabled: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('router_rules').update({ enabled }).eq('id', id)
    .select('workspace_id').maybeSingle();
  if (error) throw error;
  if (data) {
    logAudit({
      workspaceId: data.workspace_id as string,
      action: 'workspace.settings_changed', resource: 'router_rule', resourceId: id,
      diff: `enabled → ${enabled}`,
    });
  }
}

interface WorkflowRow {
  id: string; workspace_id: string; name: string; description: string | null;
  trigger_type: WorkflowTriggerType; trigger_config: Record<string, string | number>;
  steps: WorkflowStep[]; enabled: boolean;
  runs_30d: number; success_rate: number; last_run_at: string | null;
}

export async function listWorkflows(workspaceId: string): Promise<Workflow[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('orchestration_workflows')
    .select('id, workspace_id, name, description, trigger_type, trigger_config, steps, enabled, runs_30d, success_rate, last_run_at')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as WorkflowRow;
    return {
      id: row.id, workspaceId: row.workspace_id, name: row.name,
      description: row.description ?? '',
      trigger: row.trigger_type, triggerConfig: row.trigger_config,
      steps: row.steps, enabled: row.enabled,
      runs30d: row.runs_30d, successRate: Number(row.success_rate),
      lastRunAt: row.last_run_at ?? undefined,
    };
  });
}

export async function toggleWorkflow(id: string, enabled: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('orchestration_workflows').update({ enabled }).eq('id', id)
    .select('workspace_id').maybeSingle();
  if (error) throw error;
  if (data) {
    logAudit({
      workspaceId: data.workspace_id as string,
      action: 'workspace.settings_changed', resource: 'workflow', resourceId: id,
      diff: `enabled → ${enabled}`,
    });
  }
}

interface HandoffRow {
  id: string; workspace_id: string; conversation_id: string | null; customer_name: string;
  from_agent_id: string | null; from_agent_name: string;
  to_agent_id: string | null; to_agent_name: string;
  reason: string; context_preserved: boolean; created_at: string;
}

export async function listHandoffs(workspaceId: string, limit = 50): Promise<AgentHandoff[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('agent_handoffs')
    .select('id, workspace_id, conversation_id, customer_name, from_agent_id, from_agent_name, to_agent_id, to_agent_name, reason, context_preserved, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as HandoffRow;
    return {
      id: row.id, conversationId: row.conversation_id ?? '',
      customerName: row.customer_name,
      fromAgentId: row.from_agent_id ?? '', fromAgentName: row.from_agent_name,
      toAgentId: row.to_agent_id ?? '', toAgentName: row.to_agent_name,
      reason: row.reason, contextPreserved: row.context_preserved,
      timestamp: row.created_at,
    };
  });
}

interface TraceRow {
  id: string; workspace_id: string; conversation_id: string | null;
  agent_id: string | null; agent_name: string;
  user_query: string; final_answer: string | null;
  steps: DecisionTraceStep[]; total_latency_ms: number; total_tokens: number;
  status: DecisionTrace['status']; created_at: string;
}

export async function listTraces(workspaceId: string, limit = 30): Promise<DecisionTrace[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('decision_traces')
    .select('id, workspace_id, conversation_id, agent_id, agent_name, user_query, final_answer, steps, total_latency_ms, total_tokens, status, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as TraceRow;
    return {
      id: row.id, conversationId: row.conversation_id ?? '',
      agentId: row.agent_id ?? '', agentName: row.agent_name,
      userQuery: row.user_query, finalAnswer: row.final_answer ?? '',
      steps: row.steps, totalLatencyMs: row.total_latency_ms,
      totalTokens: row.total_tokens, status: row.status,
      timestamp: row.created_at,
    };
  });
}
