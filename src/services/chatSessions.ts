/**
 * Sessões + pastas do chat com colaborador (estilo Claude).
 * Cada sessão é uma conversa; pastas organizam sessões. Tudo por (user, agente).
 */

import { supabase } from '@/lib/supabase';

export interface ChatFolder {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ChatSession {
  id: string;
  agentId: string;
  folderId: string | null;
  title: string;
  updatedAt: string;
}

export async function listFolders(agentId: string, userId: string): Promise<ChatFolder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('chat_folders')
    .select('id,name,sort_order')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

export async function createFolder(agentId: string, userId: string, name: string): Promise<ChatFolder> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('chat_folders')
    .insert({ agent_id: agentId, user_id: userId, name })
    .select('id,name,sort_order')
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, sortOrder: data.sort_order };
}

export async function renameFolder(id: string, name: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_folders').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_folders').delete().eq('id', id);
  if (error) throw error;
}

export async function listSessions(agentId: string, userId: string): Promise<ChatSession[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id,agent_id,folder_id,title,updated_at')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    folderId: r.folder_id,
    title: r.title,
    updatedAt: r.updated_at,
  }));
}

export async function createSession(
  agentId: string,
  userId: string,
  opts: { folderId?: string | null; title?: string } = {},
): Promise<ChatSession> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      agent_id: agentId,
      user_id: userId,
      folder_id: opts.folderId ?? null,
      title: opts.title ?? 'Nova conversa',
    })
    .select('id,agent_id,folder_id,title,updated_at')
    .single();
  if (error) throw error;
  return { id: data.id, agentId: data.agent_id, folderId: data.folder_id, title: data.title, updatedAt: data.updated_at };
}

export async function renameSession(id: string, title: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function moveSession(id: string, folderId: string | null): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').update({ folder_id: folderId }).eq('id', id);
  if (error) throw error;
}

export async function deleteSession(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
  if (error) throw error;
}

export async function touchSession(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', id);
}
