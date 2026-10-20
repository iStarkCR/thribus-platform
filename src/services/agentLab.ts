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

// ─── Cenário completo (multi-turno via canal de teste do Talki) ───────────────

export interface ScenarioSession {
  conversationId: number;
  inboxId: string;
  accountId: string;
  contactId: number;
  channel: string;
  channelAppended: boolean;
  requiredLabel: string | null;
  base: string;
}

export interface ScenarioMessage {
  type: 'incoming' | 'outgoing' | 'template' | string;
  content: string;
  createdAt?: number;
}

async function invokeScenario<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('agent-lab-scenario', { body });
  if (error) throw error;
  const payload = data as (T & { error?: string }) | null;
  if (!payload || (payload as { error?: string }).error) {
    throw new Error((payload as { error?: string })?.error ?? 'resposta vazia da função de cenário');
  }
  return payload as T;
}

/** Inicia um cenário: roteia o agente ao inbox de teste e cria contato+conversa. */
export async function startScenario(agentId: string, warmup?: string[]): Promise<ScenarioSession> {
  const r = await invokeScenario<{
    conversation_id: number; inbox_id: string; account_id: string; contact_id: number;
    channel: string; channel_appended: boolean; required_label: string | null; base: string;
  }>({ action: 'start', agent_id: agentId, warmup });
  return {
    conversationId: r.conversation_id,
    inboxId: r.inbox_id,
    accountId: r.account_id,
    contactId: r.contact_id,
    channel: r.channel,
    channelAppended: r.channel_appended,
    requiredLabel: r.required_label,
    base: r.base,
  };
}

/** Manda 1 mensagem do "cliente simulado" (incoming) na conversa de teste. */
export async function sendScenarioMessage(agentId: string, conversationId: number, content: string): Promise<void> {
  await invokeScenario({ action: 'send', agent_id: agentId, conversation_id: conversationId, content });
}

/** Coleta o transcript completo da conversa de teste. */
export async function pollScenario(agentId: string, conversationId: number): Promise<ScenarioMessage[]> {
  const r = await invokeScenario<{ messages: Array<{ type: string; content: string; created_at?: number }> }>(
    { action: 'poll', agent_id: agentId, conversation_id: conversationId },
  );
  return r.messages.map((m) => ({ type: m.type, content: m.content, createdAt: m.created_at }));
}

/** Encerra o teste: remove o channel de teste do agente e resolve a conversa. */
export async function endScenario(agentId: string, channel: string, conversationId?: number): Promise<void> {
  await invokeScenario({ action: 'end', agent_id: agentId, channel, conversation_id: conversationId });
}
