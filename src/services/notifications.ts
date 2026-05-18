/**
 * Notifications service — central in-app + realtime.
 *
 * Usuário vê broadcasts do workspace + as direcionadas a ele.
 * Subscribe a inserts pra mostrar toast em tempo real.
 */

import { supabase } from '@/lib/supabase';
import type { AppNotification, NotifKind } from '@/lib/seed-final';

export const notificationsConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface NotifRow {
  id: string; workspace_id: string; user_id: string | null;
  kind: NotifKind; title: string; body: string | null; href: string | null;
  source: string | null; read: boolean; created_at: string;
}

function rowToNotif(r: NotifRow): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body ?? '',
    href: r.href ?? undefined,
    source: r.source ?? undefined,
    read: r.read,
    timestamp: r.created_at,
  };
}

export async function listNotifications(workspaceId: string, limit = 50): Promise<AppNotification[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToNotif(r as NotifRow));
}

export async function markRead(id: string, read = true): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('notifications').update({ read }).eq('id', id);
  if (error) throw error;
}

export async function markAllRead(workspaceId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('workspace_id', workspaceId)
    .eq('read', false);
  if (error) throw error;
}

/**
 * Subscribe a novas notifs no workspace.
 * Callback recebe o registro recém-criado pra mostrar toast etc.
 */
export function subscribeNotifications(workspaceId: string, onInsert: (n: AppNotification) => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`notifications:${workspaceId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => onInsert(rowToNotif(payload.new as NotifRow)),
    )
    .subscribe();
  return () => { supabase!.removeChannel(ch); };
}
