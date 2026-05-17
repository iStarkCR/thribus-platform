/**
 * Talki / Chatwoot API client (real).
 *
 * Quando VITE_TALKI_URL + VITE_TALKI_ACCOUNT_ID + VITE_TALKI_API_TOKEN
 * estiverem setados no .env, a inbox passa a consumir dados reais.
 * Sem env vars, a UI cai pro mock (SEED_INBOX_*).
 *
 * Docs: https://www.chatwoot.com/developers/api/
 */

const BASE_URL = import.meta.env.VITE_TALKI_URL as string | undefined;
const ACCOUNT_ID = import.meta.env.VITE_TALKI_ACCOUNT_ID as string | undefined;
const API_TOKEN = import.meta.env.VITE_TALKI_API_TOKEN as string | undefined;

export const talkiConfigured = Boolean(BASE_URL && ACCOUNT_ID && API_TOKEN);

export interface TalkiConversation {
  id: number;
  status: 'open' | 'pending' | 'resolved' | 'snoozed';
  inbox_id: number;
  contact_last_seen_at: number;
  unread_count: number;
  meta: {
    sender: { id: number; name: string; phone_number?: string; email?: string };
    channel: string;
    assignee?: { id: number; name: string };
  };
  messages: { content: string; created_at: string; message_type: number }[];
  labels: string[];
}

interface ApiOptions {
  page?: number;
  status?: 'open' | 'resolved' | 'all';
  assignee_type?: 'me' | 'unassigned' | 'assigned';
}

async function talkiFetch<T>(path: string): Promise<T> {
  if (!talkiConfigured) throw new Error('Talki não configurado — defina VITE_TALKI_* no .env');
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
    headers: { 'api_access_token': API_TOKEN!, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Talki ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listConversations(opts: ApiOptions = {}): Promise<TalkiConversation[]> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.status) params.set('status', opts.status);
  if (opts.assignee_type) params.set('assignee_type', opts.assignee_type);
  const data = await talkiFetch<{ data: { payload: TalkiConversation[] } }>(`/conversations?${params}`);
  return data.data.payload;
}

export async function sendMessage(conversationId: number, content: string, isPrivate = false) {
  if (!talkiConfigured) throw new Error('Talki não configurado');
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'api_access_token': API_TOKEN!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, message_type: 'outgoing', private: isPrivate }),
  });
  if (!res.ok) throw new Error(`Talki send ${res.status}`);
  return res.json();
}

export async function toggleStatus(conversationId: number, status: 'open' | 'resolved' | 'pending') {
  if (!talkiConfigured) throw new Error('Talki não configurado');
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/toggle_status`, {
    method: 'POST',
    headers: { 'api_access_token': API_TOKEN!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Talki toggle ${res.status}`);
  return res.json();
}
