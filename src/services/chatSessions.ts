/**
 * Sessões + pastas do chat com colaborador (estilo Claude).
 * Cada sessão é uma conversa; pastas organizam sessões. Tudo por (user, agente).
 */

import { supabase } from '@/lib/supabase';

export interface ChatFolder {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
  color: string | null;
}

export interface ChatSession {
  id: string;
  agentId: string;
  folderId: string | null;
  title: string;
  updatedAt: string;
  contextTokens: number;
  archivedAt: string | null;
  color: string | null;
  pinnedAt: string | null;
}

const FOLDER_COLS = 'id,name,sort_order,parent_id,color';
const toFolder = (r: { id: string; name: string; sort_order: number; parent_id: string | null; color: string | null }): ChatFolder => ({
  id: r.id, name: r.name, sortOrder: r.sort_order, parentId: r.parent_id, color: r.color,
});

const SESSION_COLS = 'id,agent_id,folder_id,title,updated_at,context_tokens,archived_at,color,pinned_at';
interface SessionRow {
  id: string; agent_id: string; folder_id: string | null; title: string; updated_at: string;
  context_tokens: number | null; archived_at: string | null; color: string | null; pinned_at: string | null;
}
const toSession = (r: SessionRow): ChatSession => ({
  id: r.id, agentId: r.agent_id, folderId: r.folder_id, title: r.title, updatedAt: r.updated_at,
  contextTokens: r.context_tokens ?? 0, archivedAt: r.archived_at ?? null, color: r.color ?? null, pinnedAt: r.pinned_at ?? null,
});

export async function listFolders(agentId: string, userId: string): Promise<ChatFolder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('chat_folders')
    .select(FOLDER_COLS)
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toFolder);
}

export async function createFolder(
  agentId: string,
  userId: string,
  name: string,
  opts: { parentId?: string | null; color?: string | null } = {},
): Promise<ChatFolder> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('chat_folders')
    .insert({ agent_id: agentId, user_id: userId, name, parent_id: opts.parentId ?? null, color: opts.color ?? null })
    .select(FOLDER_COLS)
    .single();
  if (error) throw error;
  return toFolder(data);
}

export async function updateFolder(id: string, patch: { name?: string; color?: string | null; parentId?: string | null }): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.parentId !== undefined) row.parent_id = patch.parentId;
  const { error } = await supabase.from('chat_folders').update(row).eq('id', id);
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
    .select(SESSION_COLS)
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SessionRow[]).map(toSession);
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
    .select(SESSION_COLS)
    .single();
  if (error) throw error;
  return toSession(data as SessionRow);
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

export async function setSessionArchived(id: string, archived: boolean): Promise<string | null> {
  if (!supabase) return null;
  const archivedAt = archived ? new Date().toISOString() : null;
  const { error } = await supabase.from('chat_sessions').update({ archived_at: archivedAt }).eq('id', id);
  if (error) throw error;
  return archivedAt;
}

export async function setSessionColor(id: string, color: string | null): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').update({ color }).eq('id', id);
  if (error) throw error;
}

export async function setSessionPinned(id: string, pinned: boolean): Promise<string | null> {
  if (!supabase) return null;
  const pinnedAt = pinned ? new Date().toISOString() : null;
  const { error } = await supabase.from('chat_sessions').update({ pinned_at: pinnedAt }).eq('id', id);
  if (error) throw error;
  return pinnedAt;
}

/**
 * Duplica uma conversa (fork): cria uma nova sessão com o mesmo histórico, pra
 * ramificar sem mexer na original. A nova NÃO herda a sessão do claude nem a
 * janela de contexto — o daemon recomeça o contexto semeando com o histórico
 * copiado na próxima mensagem.
 */
export async function forkSession(source: ChatSession, userId: string): Promise<ChatSession> {
  if (!supabase) throw new Error('Supabase não configurado');
  const created = await createSession(source.agentId, userId, { folderId: source.folderId, title: `${source.title} (cópia)` });
  if (source.color) await setSessionColor(created.id, source.color);
  const { data: msgs, error } = await supabase
    .from('collaborator_messages')
    .select('role,content,channel,attachments,created_at')
    .eq('session_id', source.id)
    .eq('status', 'done')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (msgs && msgs.length) {
    const rows = msgs.map((m) => ({
      session_id: created.id, agent_id: source.agentId, user_id: userId,
      role: m.role, content: m.content, status: 'done', channel: m.channel,
      attachments: m.attachments ?? null, created_at: m.created_at,
    }));
    const { error: insErr } = await supabase.from('collaborator_messages').insert(rows);
    if (insErr) throw insErr;
  }
  return { ...created, color: source.color };
}

export async function touchSession(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

// ─── Uso agregado por sessão (tokens/custo consumidos por conversa) ───────────
export interface SessionUsage {
  costUsd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  runs: number;
  lastAt: string | null;
}

/** Mapa session_id → canal de origem (telegram/talki/thribus). */
export async function getSessionsChannels(agentId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabase) return out;
  const { data, error } = await supabase.rpc('chat_session_channels', { p_agent_id: agentId });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ session_id: string; channel: string }>) {
    out.set(String(r.session_id), r.channel);
  }
  return out;
}

/** Mapa session_id → uso somado (via RPC chat_session_usage). */
export async function getSessionsUsage(agentId: string): Promise<Map<string, SessionUsage>> {
  const out = new Map<string, SessionUsage>();
  if (!supabase) return out;
  const { data, error } = await supabase.rpc('chat_session_usage', { p_agent_id: agentId });
  if (error) throw error;
  for (const r of (data ?? []) as Array<Record<string, number | string | null>>) {
    out.set(String(r.session_id), {
      costUsd: Number(r.cost_usd) || 0,
      totalTokens: Number(r.total_tokens) || 0,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      cacheReadTokens: Number(r.cache_read_tokens) || 0,
      runs: Number(r.runs) || 0,
      lastAt: (r.last_at as string) ?? null,
    });
  }
  return out;
}
