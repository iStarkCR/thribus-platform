/**
 * Talki / Chatwoot API Client
 *
 * Talki é uma instância white-label de Chatwoot.
 * Docs: https://www.chatwoot.com/developers/api/
 *
 * Auth: header `api_access_token: <token>`
 * Base URL: https://talki.<dominio>/api/v1/accounts/{ACCOUNT_ID}/
 *
 * Configurar:
 *   TALKI_BASE_URL=https://talki.thribustech.com
 *   TALKI_ACCOUNT_ID=5
 *   TALKI_API_TOKEN=<seu_token>
 */

const BASE = process.env.TALKI_BASE_URL ?? '';
const ACCOUNT_ID = process.env.TALKI_ACCOUNT_ID ?? '';
const TOKEN = process.env.TALKI_API_TOKEN ?? '';

function url(path: string): string {
  return `${BASE}/api/v1/accounts/${ACCOUNT_ID}${path}`;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    api_access_token: TOKEN,
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE || !ACCOUNT_ID || !TOKEN) {
    throw new Error('Talki não configurado: defina TALKI_BASE_URL, TALKI_ACCOUNT_ID e TALKI_API_TOKEN');
  }
  const res = await fetch(url(path), {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null as T;

  const json = (await res.json()) as T;

  if (!res.ok) {
    const err = json as { error?: string; message?: string };
    throw new Error(`Talki ${res.status}: ${err.error ?? err.message ?? res.statusText}`);
  }

  return json;
}

// ─── Tipos (Chatwoot) ─────────────────────────────────────────────────────────

export interface TalkiContact {
  id: number;
  name: string;
  phone_number: string | null;
  email: string | null;
}

export interface TalkiMessage {
  id: number;
  content: string;
  message_type: number; // 0=incoming, 1=outgoing, 2=activity, 3=template
  content_type: string; // 'text' | 'input_select' | etc.
  created_at: number;   // unix timestamp
  sender?: { id: number; name: string; type: string };
  inbox_id?: number;
  conversation_id?: number;
}

export interface TalkiConversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  contact: TalkiContact;
  meta?: { sender?: TalkiContact };
  messages?: TalkiMessage[];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversations = {
  async get(id: number): Promise<TalkiConversation> {
    return req<TalkiConversation>('GET', `/conversations/${id}`);
  },

  /**
   * Lista as labels (etiquetas) aplicadas a uma conversa.
   * Endpoint: GET /conversations/:id/labels → { payload: ["label1", "label2"] }
   */
  async listLabels(id: number): Promise<string[]> {
    try {
      const res = await req<{ payload: string[] } | string[]>('GET', `/conversations/${id}/labels`);
      if (Array.isArray(res)) return res;
      return res.payload ?? [];
    } catch {
      return [];
    }
  },

  async listByInbox(inboxId: number, status: 'open' | 'all' = 'open'): Promise<{ data: { payload: TalkiConversation[] } }> {
    return req('GET', `/conversations?inbox_id=${inboxId}&status=${status}&assignee_type=me&page=1`);
  },

  async setStatus(id: number, status: 'open' | 'resolved' | 'pending'): Promise<TalkiConversation> {
    return req<TalkiConversation>('POST', `/conversations/${id}/toggle_status`, { status });
  },

  async listMessages(id: number): Promise<{ payload: TalkiMessage[] }> {
    return req('GET', `/conversations/${id}/messages`);
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = {
  async send(conversationId: number, content: string): Promise<TalkiMessage> {
    return req<TalkiMessage>('POST', `/conversations/${conversationId}/messages`, {
      content,
      message_type: 'outgoing',
      content_type: 'text',
    });
  },
};

// ─── Inboxes ──────────────────────────────────────────────────────────────────

export const inboxes = {
  async list(): Promise<{ payload: Array<{ id: number; name: string; channel_type: string }> }> {
    return req('GET', '/inboxes');
  },
};
