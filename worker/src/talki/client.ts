/**
 * Talki / Chatwoot API Client
 *
 * Suporta config tanto via env vars (single-tenant) quanto via objeto
 * `cfg` (multi-tenant — workspace.crm_*).
 */

// ─── Configuração ─────────────────────────────────────────────────────────────

export interface TalkiConfig {
  baseUrl: string;
  accountId: string;
  apiToken: string;
}

function fromEnv(): TalkiConfig {
  return {
    baseUrl: process.env.TALKI_BASE_URL ?? '',
    accountId: process.env.TALKI_ACCOUNT_ID ?? '',
    apiToken: process.env.TALKI_API_TOKEN ?? '',
  };
}

function url(cfg: TalkiConfig, path: string): string {
  return `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`;
}

function headers(cfg: TalkiConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    api_access_token: cfg.apiToken,
  };
}

async function req<T>(cfg: TalkiConfig, method: string, path: string, body?: unknown): Promise<T> {
  if (!cfg.baseUrl || !cfg.accountId || !cfg.apiToken) {
    throw new Error('Talki não configurado: defina TALKI_BASE_URL, TALKI_ACCOUNT_ID e TALKI_API_TOKEN (ou via workspace)');
  }
  const res = await fetch(url(cfg, path), {
    method,
    headers: headers(cfg),
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
  async get(id: number, cfg: TalkiConfig = fromEnv()): Promise<TalkiConversation> {
    return req<TalkiConversation>(cfg, 'GET', `/conversations/${id}`);
  },

  async listLabels(id: number, cfg: TalkiConfig = fromEnv()): Promise<string[]> {
    try {
      const res = await req<{ payload: string[] } | string[]>(cfg, 'GET', `/conversations/${id}/labels`);
      if (Array.isArray(res)) return res;
      return res.payload ?? [];
    } catch {
      return [];
    }
  },

  async listByInbox(inboxId: number, status: 'open' | 'all' = 'open', cfg: TalkiConfig = fromEnv()): Promise<{ data: { payload: TalkiConversation[] } }> {
    return req(cfg, 'GET', `/conversations?inbox_id=${inboxId}&status=${status}&assignee_type=me&page=1`);
  },

  async setStatus(id: number, status: 'open' | 'resolved' | 'pending', cfg: TalkiConfig = fromEnv()): Promise<TalkiConversation> {
    return req<TalkiConversation>(cfg, 'POST', `/conversations/${id}/toggle_status`, { status });
  },

  async listMessages(id: number, cfg: TalkiConfig = fromEnv()): Promise<{ payload: TalkiMessage[] }> {
    return req(cfg, 'GET', `/conversations/${id}/messages`);
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = {
  async send(conversationId: number, content: string, cfg: TalkiConfig = fromEnv()): Promise<TalkiMessage> {
    return req<TalkiMessage>(cfg, 'POST', `/conversations/${conversationId}/messages`, {
      content,
      message_type: 'outgoing',
      content_type: 'text',
    });
  },

  /**
   * Envia uma "private note" — mensagem interna visível apenas pra agentes
   * dentro do Chatwoot, não entregue ao cliente. Útil pra deixar contexto
   * antes de passar a conversa pra humano.
   */
  async privateNote(conversationId: number, content: string, cfg: TalkiConfig = fromEnv()): Promise<TalkiMessage> {
    return req<TalkiMessage>(cfg, 'POST', `/conversations/${conversationId}/messages`, {
      content,
      message_type: 'outgoing',
      content_type: 'text',
      private: true,
    });
  },

  /**
   * Envia áudio (ou outro arquivo) via multipart form-data.
   * Chatwoot processa e entrega como mensagem com attachment.
   */
  async sendAudio(
    conversationId: number,
    audioBuffer: Buffer,
    opts: { filename?: string; mimeType?: string; caption?: string } = {},
    cfg: TalkiConfig = fromEnv(),
  ): Promise<unknown> {
    if (!cfg.baseUrl || !cfg.accountId || !cfg.apiToken) {
      throw new Error('Talki não configurado');
    }
    const filename = opts.filename ?? 'audio.ogg';
    const mimeType = opts.mimeType ?? 'audio/ogg';

    const form = new FormData();
    form.append('message_type', 'outgoing');
    if (opts.caption) form.append('content', opts.caption);
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    form.append('attachments[]', blob, filename);

    const res = await fetch(url(cfg, `/conversations/${conversationId}/messages`), {
      method: 'POST',
      headers: { api_access_token: cfg.apiToken },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Talki sendAudio ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  },
};

// ─── Inboxes ──────────────────────────────────────────────────────────────────

export const inboxes = {
  async list(cfg: TalkiConfig = fromEnv()): Promise<{ payload: Array<{ id: number; name: string; channel_type: string }> }> {
    return req(cfg, 'GET', '/inboxes');
  },
};

// ─── Helper: monta config a partir de workspace ───────────────────────────────

export function configFromWorkspace(ws?: {
  crmBaseUrl?: string;
  crmAccountId?: string;
  crmApiToken?: string;
}): TalkiConfig {
  const env = fromEnv();
  return {
    baseUrl: ws?.crmBaseUrl || env.baseUrl,
    accountId: ws?.crmAccountId || env.accountId,
    apiToken: ws?.crmApiToken || env.apiToken,
  };
}
