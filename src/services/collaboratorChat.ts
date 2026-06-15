/**
 * Chat direto com colaborador (Bukowiski etc.).
 *
 * Painel insere a msg do usuário (role='user', status='pending'); o daemon do
 * Claude Code grava a resposta (role='assistant'). Painel acompanha via realtime.
 */

import { supabase } from '@/lib/supabase';

export type ChatRole = 'user' | 'assistant';
export type ChatStatus = 'pending' | 'processing' | 'done' | 'error';
export type ChatChannel = 'thribus' | 'telegram' | 'talki';

export interface ChatMessage {
  id: string;
  agentId: string;
  userId: string;
  role: ChatRole;
  content: string;
  status: ChatStatus;
  channel: ChatChannel;
  error: string | null;
  createdAt: string;
}

export const chatConfigured = Boolean(supabase);

interface Row {
  id: string;
  agent_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  status: ChatStatus;
  channel: ChatChannel;
  error: string | null;
  created_at: string;
}

const toMsg = (r: Row): ChatMessage => ({
  id: r.id,
  agentId: r.agent_id,
  userId: r.user_id,
  role: r.role,
  content: r.content,
  status: r.status,
  channel: r.channel,
  error: r.error,
  createdAt: r.created_at,
});

export async function listMessages(agentId: string, userId: string): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('collaborator_messages')
    .select('*')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toMsg);
}

export async function sendMessage(agentId: string, userId: string, content: string): Promise<ChatMessage> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('collaborator_messages')
    .insert({ agent_id: agentId, user_id: userId, role: 'user', content, status: 'pending', channel: 'thribus' })
    .select('*')
    .single();
  if (error) throw error;
  return toMsg(data as Row);
}

/** Realtime do thread do usuário. Chama onChange a cada insert/update. */
export function subscribeChat(userId: string, onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`collab-chat:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'collaborator_messages', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
