/**
 * Chat direto com colaborador (Bukowiski etc.).
 *
 * Painel insere a msg do usuário (role='user', status='pending'); o daemon do
 * Claude Code grava a resposta (role='assistant'). Painel acompanha via realtime.
 */

import { supabase } from '@/lib/supabase';

export type ChatRole = 'user' | 'assistant' | 'system'; // 'system' = marcador de compactação (divisor + TL;DR)
export type ChatStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled';
export type ChatChannel = 'thribus' | 'telegram' | 'talki';

export interface Attachment {
  path: string;   // caminho no bucket chat-attachments
  name: string;
  mime: string;
  size: number;
  previewUrl?: string; // object URL local (miniatura instantânea no composer, antes do upload terminar)
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

// ─── Reply / quote (estilo WhatsApp) ────────────────────────────────────────
// Sem coluna no banco: a referência da mensagem citada viaja num MARCADOR no
// início do `content` da mensagem do usuário — `<!--reply {json}-->\n<texto>`.
// O marcador é invisível ao usuário (parseReply o separa pra render) e é lido
// pela ponte (bukowiski-bridge) pra injetar o contexto da citação no prompt do
// Claude. Só mensagens role='user' carregam o marcador.
export interface ReplyRef {
  id: string;
  role: ChatRole;
  text: string; // trecho resumido da mensagem citada
}

// Terminador por `-->`; o texto da citação é sanitizado (sem `-->`) ao montar,
// então o JSON nunca contém o terminador e o parse é robusto a `{`/`}` no texto.
const REPLY_MARKER_RE = /^<!--reply ([\s\S]*?)-->\n?/;

/** Resume um trecho pra usar como citação (tira markdown/código, colapsa espaço). */
export function summarizeForQuote(text: string): string {
  return parseReply(text).body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Prefixa o marcador de reply no conteúdo (no-op quando não há citação). */
export function buildReplyContent(reply: ReplyRef | null | undefined, text: string): string {
  if (!reply) return text;
  const safe = reply.text.replace(/-->/g, '— >').replace(/\s+/g, ' ').trim().slice(0, 240);
  const meta = JSON.stringify({ id: reply.id, role: reply.role, text: safe });
  return `<!--reply ${meta}-->\n${text}`;
}

/** Separa o marcador de reply do corpo da mensagem. */
export function parseReply(content: string): { reply: ReplyRef | null; body: string } {
  const m = REPLY_MARKER_RE.exec(content);
  if (!m) return { reply: null, body: content };
  try {
    const r = JSON.parse(m[1]) as ReplyRef;
    if (r && typeof r.text === 'string' && typeof r.id === 'string') {
      return { reply: r, body: content.slice(m[0].length) };
    }
  } catch { /* marcador malformado → trata o conteúdo inteiro como texto */ }
  return { reply: null, body: content };
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

/**
 * "Editar & reenviar": apaga a mensagem a partir de `fromCreatedAt` (inclusive) e
 * tudo que veio depois nela, pra não duplicar a conversa ao reenviar editado.
 */
export async function deleteMessagesFrom(sessionId: string, fromCreatedAt: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('collaborator_messages')
    .delete()
    .eq('session_id', sessionId)
    .gte('created_at', fromCreatedAt);
  if (error) throw error;
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

/**
 * Realtime do thread do usuário. Chama onChange a cada insert/update, passando a
 * sessão afetada (pra quem quiser ignorar eventos de outras conversas). Reconecta
 * sozinho com backoff se o canal cair (Mac dorme, wifi oscila) — antes parava de
 * receber resposta silenciosamente.
 */
let chanSeq = 0;
export function subscribeChat(
  userId: string,
  onChange: (info?: { sessionId: string | null }) => void,
): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  let channel: ReturnType<typeof sb.channel> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closed = false;

  const connect = () => {
    if (closed) return;
    // Nome de canal único por assinante — vários componentes (TalkPage + orbe) podem
    // assinar o mesmo userId ao mesmo tempo. Reusar o nome quebra: o Supabase recusa
    // `.on()` num canal já `subscribe()`d.
    const ch = sb
      .channel(`collab-chat:${userId}:${++chanSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collaborator_messages', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { session_id?: string } | null;
          onChange({ sessionId: row?.session_id ?? null });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { attempt = 0; return; }
        if (closed) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (retry) clearTimeout(retry);
          const delay = Math.min(15000, 1000 * 2 ** attempt++); // 1s,2s,4s… até 15s
          retry = setTimeout(() => { sb.removeChannel(ch); connect(); }, delay);
        }
      });
    channel = ch;
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (channel) sb.removeChannel(channel);
  };
}

/**
 * Reescreve a mensagem do usuário num prompt mais claro/estruturado via edge
 * function `improve-prompt` (a chave OpenAI fica server-side, nunca no front).
 * Devolve o texto reescrito.
 */
export async function improvePrompt(agentId: string, text: string): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('improve-prompt', {
    body: { agentId, text },
  });
  if (error) throw error;
  return ((data as { improved?: string } | null)?.improved ?? '').trim();
}
