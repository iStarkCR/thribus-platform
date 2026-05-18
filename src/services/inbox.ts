/**
 * Inbox service — lê inbox_conversations + inbox_messages do Supabase.
 *
 * Webhook `talki-webhook` (edge function) ingere mensagens do Chatwoot/Talki
 * em tempo real. Frontend só lê + subscribe ao realtime.
 *
 * Quando Supabase não configurado, retorna [] e a UI cai pro mock (SEED_*).
 */

import { supabase } from '@/lib/supabase';
import type { InboxConversation, InboxMessage, InboxChannel, InboxStatus } from '@/lib/seed-inbox';

export const inboxConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface ConversationRow {
  id: string;
  workspace_id: string;
  external_id: string;
  channel: InboxChannel;
  status: InboxStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  assigned_agent_id: string | null;
  last_preview: string | null;
  last_sentiment: number;
  unread_count: number;
  tags: string[];
  last_activity_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  workspace_id: string;
  external_id: string | null;
  channel: InboxChannel;
  direction: 'in' | 'out';
  sender_name: string;
  sender_id: string | null;
  body: string | null;
  is_bot: boolean;
  attachments: { name: string; type: 'image' | 'audio' | 'file' }[];
  created_at: string;
}

function rowToConversation(r: ConversationRow): InboxConversation {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    customerId: r.customer_id ?? r.external_id,
    customerName: r.customer_name ?? 'Cliente',
    channels: [r.channel],
    primaryChannel: r.channel,
    status: r.status,
    assignedAgentId: r.assigned_agent_id ?? undefined,
    unreadCount: r.unread_count,
    lastPreview: r.last_preview ?? '',
    lastSentiment: r.last_sentiment,
    lastActivityAt: r.last_activity_at,
    tags: r.tags,
  };
}

function rowToMessage(r: MessageRow): InboxMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    channel: r.channel,
    direction: r.direction,
    sender: r.sender_name,
    body: r.body ?? '',
    isBot: r.is_bot,
    attachments: r.attachments,
    timestamp: r.created_at,
  };
}

export async function listConversations(workspaceId: string, limit = 50): Promise<InboxConversation[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('inbox_conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('last_activity_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToConversation(r as ConversationRow));
}

export async function listMessages(conversationId: string, limit = 200): Promise<InboxMessage[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToMessage(r as MessageRow));
}

/**
 * Subscribe a inserts em inbox_conversations + inbox_messages do workspace.
 * Callback dispara quando há mudança — invoke listConversations() pra refrescar.
 *
 * Uso:
 *   const unsub = subscribeInbox('ws_x', () => refetch());
 *   ... (depois) unsub();
 */
export function subscribeInbox(workspaceId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`inbox:${workspaceId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'inbox_conversations', filter: `workspace_id=eq.${workspaceId}` },
      onChange,
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `workspace_id=eq.${workspaceId}` },
      onChange,
    )
    .subscribe();
  return () => { supabase!.removeChannel(ch); };
}
