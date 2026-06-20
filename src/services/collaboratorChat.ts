/**
 * Chat direto com colaborador (Bukowiski etc.).
 *
 * Painel insere a msg do usuário (role='user', status='pending'); o daemon do
 * Claude Code grava a resposta (role='assistant'). Painel acompanha via realtime.
 */

import { supabase } from '@/lib/supabase';

export type ChatRole = 'user' | 'assistant';
export type ChatStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled';
export type ChatChannel = 'thribus' | 'telegram' | 'talki';

export interface Attachment {
  path: string;   // caminho no bucket chat-attachments
  name: string;
  mime: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string | null;
  agentId: string;
  userId: string;
  role: ChatRole;
  content: string;
  status: ChatStatus;
  channel: ChatChannel;
  error: string | null;
  attachments: Attachment[];
  createdAt: string;
}

const ATTACH_BUCKET = 'chat-attachments';

/** Sobe um arquivo pro bucket e devolve o metadado pra anexar na mensagem. */
export async function uploadAttachment(userId: string, sessionId: string | null, file: File): Promise<Attachment> {
  if (!supabase) throw new Error('Supabase não configurado');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${sessionId ?? 'avulso'}/${Date.now()}-${rand}-${safe}`;
  const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size };
}

/** URL assinada (temporária) pra exibir/baixar o anexo no chat. */
export async function attachmentUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const chatConfigured = Boolean(supabase);

interface Row {
  id: string;
  session_id: string | null;
  agent_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  status: ChatStatus;
  channel: ChatChannel;
  error: string | null;
  attachments: Attachment[] | null;
  created_at: string;
}

const toMsg = (r: Row): ChatMessage => ({
  id: r.id,
  sessionId: r.session_id,
  agentId: r.agent_id,
  userId: r.user_id,
  role: r.role,
  content: r.content,
  status: r.status,
  channel: r.channel,
  error: r.error,
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
  createdAt: r.created_at,
});

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('collaborator_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toMsg);
}

export async function sendMessage(
  sessionId: string,
  agentId: string,
  userId: string,
  content: string,
  attachments?: Attachment[],
  isVoice = false,
): Promise<ChatMessage> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('collaborator_messages')
    .insert({
      session_id: sessionId, agent_id: agentId, user_id: userId, role: 'user',
      content, status: 'pending', channel: 'thribus', is_voice: isVoice,
      attachments: attachments && attachments.length ? attachments : null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toMsg(data as Row);
}

/** Botão "Parar": marca a msg do usuário como cancelada → a ponte mata o claude. */
export async function cancelMessage(messageId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('collaborator_messages')
    .update({ status: 'cancelled' })
    .eq('id', messageId)
    .in('status', ['pending', 'processing']);
  if (error) throw error;
}

/** Realtime do thread do usuário. Chama onChange a cada insert/update. */
let chanSeq = 0;
export function subscribeChat(userId: string, onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  // Nome de canal único por assinante — vários componentes (TalkPage + orbe) podem
  // assinar o mesmo userId ao mesmo tempo. Reusar o nome quebra: o Supabase recusa
  // `.on()` num canal já `subscribe()`d.
  const ch = sb
    .channel(`collab-chat:${userId}:${++chanSeq}`)
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
