/**
 * Agent Lab — execução real do playground.
 *
 * Lista agentes reais (tabela `agents`) e roda UM turno de conversa isolado
 * via Edge Function `agent-lab-run` (que proxia pro endpoint sandbox do worker).
 * Zero efeito em produção: nada é persistido, nenhuma tool é executada de
 * verdade, nenhum canal real é notificado.
 */

import { supabase } from '@/lib/supabase';

export interface LabAgent {
  id: string;
  name: string;
  client: string;
  model: string;
  systemPrompt: string;
  workspaceId: string | null;
}

export interface LabTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LabTurnResult {
  agentId: string;
  agentName: string;
  model: string;
  content: string;
  latencyMs: number;
  tokensUsed: number;
  costUsd: number;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  stopReason: string;
  availableTools: string[];
  promptChars: number;
  note: string;
}

interface AgentRow {
  id: string;
  name: string;
  client: string;
  model: string;
  system_prompt: string;
  workspace_id: string | null;
}

/**
 * Lista agentes reais pro seletor do playground. Ordena pelos mais recentes.
 * Sem Supabase configurado, devolve []  — a UI cai no aviso de "configure".
 */
export async function listLabAgents(): Promise<LabAgent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, client, model, system_prompt, workspace_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AgentRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    client: r.client,
    model: r.model,
    systemPrompt: r.system_prompt ?? '',
    workspaceId: r.workspace_id ?? null,
  }));
}

/**
 * Roda 1 turno real contra o agente. `messages` deve terminar com role=user.
 * `overrides` permite A/B de model/prompt (ex: testar um rascunho de prompt).
 */
export async function runLabTurn(
  agentId: string,
  messages: LabTurnMessage[],
  overrides?: { model?: string; systemPrompt?: string },
): Promise<LabTurnResult> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('agent-lab-run', {
    body: {
      agent_id: agentId,
      messages,
      model: overrides?.model,
      system_prompt: overrides?.systemPrompt,
    },
  });
  if (error) throw error;
  const payload = data as (LabTurnResult & { error?: string }) | null;
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'resposta vazia do worker');
  }
  return payload;
}
