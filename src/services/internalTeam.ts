/**
 * Internal Team service — Bukowiski COO + organograma interno.
 *
 * Front escreve em internal_commands / internal_chat_messages; o daemon
 * (orchestrator) processa e grava de volta. Aqui ficam os CRUDs + as
 * subscriptions Realtime (mesmo padrão de services/notifications.ts).
 */

import { supabase } from '@/lib/supabase';

export const internalConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export type ProjectStatus =
  | 'draft' | 'planning' | 'awaiting_approval' | 'approved'
  | 'running' | 'paused' | 'done' | 'failed';
export interface InternalProject {
  id: string;
  title: string;
  brief: string;
  status: ProjectStatus;
  plan_md: string | null;
  est_cost_usd: number;
  actual_cost_usd: number;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'pending' | 'running' | 'awaiting_auth' | 'done' | 'failed' | 'skipped';
export interface InternalTask {
  id: string;
  project_id: string;
  seq: number;
  title: string;
  agent_slug: string | null;
  status: TaskStatus;
  requires_auth: boolean;
  auth_category: string | null;
  output_md: string | null;
  cost_usd: number;
}

export interface Authorization {
  id: string;
  task_id: string;
  project_id: string;
  category: string;
  summary: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

export interface CostEvent {
  id: string;
  project_id: string | null;
  agent_slug: string | null;
  model: string | null;
  cost_usd: number;
  created_at: string;
}

export interface InternalSettings {
  id: number;
  cost_ceiling_5h_usd: number;
  cost_ceiling_week_usd: number;
  paused: boolean;
  autonomy_level: 'conservative' | 'balanced' | 'aggressive';
}

export interface InternalAgent {
  slug: string;
  name: string;
  area: string | null;
  model_default: string;
  status: string;
  active: boolean;
  scope: 'internal' | 'client' | 'gestao';
  org_group: string | null;
  sector: string | null;
  description: string | null;
  skills: string[] | null;
  escalates_to: string | null;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL/ANON_KEY');
  return supabase;
}

// ─── Chat ───────────────────────────────────────────────────────────────────
export async function listChat(conversationId = 'bukowiski-main', limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await db()
    .from('internal_chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendChat(text: string, conversationId = 'bukowiski-main'): Promise<void> {
  const s = db();
  const { error: e1 } = await s.from('internal_chat_messages').insert({ conversation_id: conversationId, role: 'user', content: text });
  if (e1) throw e1;
  const { error: e2 } = await s.from('internal_commands').insert({ type: 'chat', payload: { conversation_id: conversationId } });
  if (e2) throw e2;
}

// ─── Projetos ────────────────────────────────────────────────────────────────
export async function listProjects(): Promise<InternalProject[]> {
  const { data, error } = await db()
    .from('internal_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InternalProject[];
}

export async function listTasks(projectId: string): Promise<InternalTask[]> {
  const { data, error } = await db()
    .from('internal_project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return (data ?? []) as InternalTask[];
}

export async function createProject(title: string, brief: string): Promise<string> {
  const s = db();
  const { data, error } = await s
    .from('internal_projects')
    .insert({ title, brief, status: 'draft' })
    .select('id')
    .single();
  if (error) throw error;
  const projectId = (data as { id: string }).id;
  const { error: e2 } = await s.from('internal_commands').insert({ type: 'plan', project_id: projectId, payload: {} });
  if (e2) throw e2;
  return projectId;
}

export async function approveProject(projectId: string): Promise<void> {
  const { error } = await db().from('internal_commands').insert({ type: 'approve', project_id: projectId, payload: {} });
  if (error) throw error;
}

export async function rejectProject(projectId: string): Promise<void> {
  const { error } = await db().from('internal_commands').insert({ type: 'reject', project_id: projectId, payload: {} });
  if (error) throw error;
}

// ─── Autorizações (gates) ────────────────────────────────────────────────────
export async function listPendingAuthorizations(): Promise<Authorization[]> {
  const { data, error } = await db()
    .from('internal_authorizations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Authorization[];
}

export async function decideAuthorization(auth: Authorization, approve: boolean): Promise<void> {
  const { error } = await db().from('internal_commands').insert({
    type: approve ? 'approve' : 'reject',
    project_id: auth.project_id,
    payload: { authorization_id: auth.id },
  });
  if (error) throw error;
}

// ─── Custo & settings ────────────────────────────────────────────────────────
export async function listRecentCost(sinceHours = 168): Promise<CostEvent[]> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const { data, error } = await db()
    .from('internal_cost_events')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CostEvent[];
}

export async function getSettings(): Promise<InternalSettings> {
  const { data, error } = await db().from('internal_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data as InternalSettings;
}

export async function setPaused(paused: boolean): Promise<void> {
  const { error } = await db().from('internal_settings').update({ paused }).eq('id', 1);
  if (error) throw error;
}

export async function listAgents(): Promise<InternalAgent[]> {
  const { data, error } = await db().from('internal_agents').select('*').order('slug');
  if (error) throw error;
  return (data ?? []) as InternalAgent[];
}

// ─── Realtime ────────────────────────────────────────────────────────────────
// Assina mudanças (qualquer evento) numa tabela e dispara o callback pra
// recarregar. Simples e robusto pro protótipo (recarrega em vez de patch local).
export function subscribeTable(table: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`internal:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
    .subscribe();
  return () => { supabase!.removeChannel(ch); };
}
