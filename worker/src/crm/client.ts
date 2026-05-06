/**
 * TexNet CRM API Client
 *
 * Base URL: https://texcrm.texnet.com.br/api/v1
 * Auth: header x-api-key (formato txn_<32-64 chars>)
 * Docs: TexNet API Reference v1
 */

const BASE = 'https://texcrm.texnet.com.br/api/v1';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.TEXNET_API_KEY ?? '',
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null as T;

  const json = await res.json() as T;

  if (!res.ok) {
    const err = json as { error?: string };
    throw new Error(`TexNet CRM ${res.status}: ${err.error ?? res.statusText}`);
  }

  return json;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  stage: string;
  value: number;
  tags: string | null;
  channel: string | null;
  botMode: boolean;
  botModeAt: string | null;
  notes: string | null;
  responsibleId: string | null;
  responsible: { id: string; name: string; email: string; status: string } | null;
  messages: LeadMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadMessage {
  id: string;
  content: string;
  type: string;
  direction: 'inbound' | 'outbound';
  status: string;
  createdAt: string;
  sender: { id: string; name: string } | null;
}

export interface CrmUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  teamId: string | null;
}

export type LeadStage =
  | 'aguardando'
  | 'em_atendimento'
  | 'sem_contato'
  | 'parou_responder'
  | 'sem_disponibilidade'
  | 'convertido'
  | 'perdido';

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leads = {
  async get(id: string): Promise<Lead> {
    return req<Lead>('GET', `/leads/${id}`);
  },

  async list(opts: { channel?: string; limit?: number } = {}): Promise<Lead[]> {
    const params = new URLSearchParams();
    if (opts.channel) params.set('channel', opts.channel);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = qs ? `/leads?${qs}` : '/leads';
    // TexNet pode retornar { data: Lead[] } ou Lead[] direto
    const result = await req<Lead[] | { data: Lead[] }>('GET', path);
    return Array.isArray(result) ? result : (result.data ?? []);
  },

  async update(id: string, data: Partial<{
    name: string; email: string; value: number;
    notes: string; tags: string[]; stage: LeadStage;
  }>): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}`, data);
  },

  async moveStage(id: string, stage: LeadStage): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}/stage`, { stage });
  },

  async assign(id: string, responsibleId: string): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}/assign`, { responsibleId });
  },

  async setBotMode(id: string, enabled: boolean): Promise<{ id: string; botMode: boolean }> {
    return req('PATCH', `/leads/${id}/bot-mode`, { enabled });
  },
};

// ─── Mensagens ────────────────────────────────────────────────────────────────

// Cache do senderId (uma busca por execução do worker)
let cachedSenderId: string | null = null;

async function resolveSenderId(): Promise<string | null> {
  if (cachedSenderId) return cachedSenderId;

  // 1. Override via env var
  if (process.env.TEXNET_BOT_SENDER_ID) {
    cachedSenderId = process.env.TEXNET_BOT_SENDER_ID;
    console.log(`[crm] senderId via env: ${cachedSenderId}`);
    return cachedSenderId;
  }

  // 2. Pega o primeiro user do CRM (preferencialmente admin/agent online)
  try {
    const users = await req<CrmUser[]>('GET', '/users');
    if (Array.isArray(users) && users.length > 0) {
      // Prioridade: admin online > agent online > qualquer
      const sorted = [...users].sort((a, b) => {
        const score = (u: CrmUser) =>
          (u.role === 'admin' && u.status === 'online' ? 100 : 0) +
          (u.role === 'agent' && u.status === 'online' ? 50 : 0) +
          (u.status === 'online' ? 10 : 0);
        return score(b) - score(a);
      });
      cachedSenderId = sorted[0].id;
      console.log(`[crm] senderId resolvido: ${sorted[0].name} (${sorted[0].id})`);
      return cachedSenderId;
    }
  } catch (err) {
    console.warn(`[crm] falha ao buscar users pra senderId:`, (err as Error).message);
  }

  return null;
}

export const messages = {
  async send(leadId: string, content: string): Promise<LeadMessage> {
    const senderId = await resolveSenderId();
    const body: Record<string, unknown> = { content, type: 'text' };
    if (senderId) body.senderId = senderId;
    return req<LeadMessage>('POST', `/leads/${leadId}/messages`, body);
  },

  async list(leadId: string, limit = 20): Promise<{ data: LeadMessage[] }> {
    return req('GET', `/leads/${leadId}/messages?limit=${limit}`);
  },
};

// ─── Usuários ─────────────────────────────────────────────────────────────────

export const users = {
  async list(): Promise<CrmUser[]> {
    return req<CrmUser[]>('GET', '/users');
  },

  async findOnlineAgent(): Promise<CrmUser | null> {
    const all = await this.list();
    return all.find((u) => u.role === 'agent' && u.status === 'online') ?? null;
  },
};

// ─── Canais ───────────────────────────────────────────────────────────────────

export const channels = {
  async listWhatsApp(): Promise<Array<{ name: string; status: string; slug?: string }>> {
    return req('GET', '/whatsapp/channels');
  },

  async isConnected(channelName: string): Promise<boolean> {
    try {
      const list = await this.listWhatsApp();
      // Tenta achar pelo `name` ou `slug` (TexNet pode usar qualquer um)
      const ch = list.find(
        (c) => c.name === channelName || c.slug === channelName,
      );

      // Se não conseguir localizar, assume conectado (não bloqueia envio).
      if (!ch) {
        console.warn(`[crm] canal "${channelName}" não encontrado em /whatsapp/channels — assumindo conectado`);
        return true;
      }

      // Status válidos pra conexão (TexNet retorna em PT-BR: "Ativo")
      const ok = ['connected', 'active', 'ativo', 'online', 'ready'];
      const status = (ch.status ?? '').toLowerCase();
      const isOk = ok.includes(status);

      if (!isOk) {
        console.warn(`[crm] canal "${channelName}" status="${ch.status}" — não está em ${ok.join('|')}`);
      }
      return isOk;
    } catch (err) {
      // Se falhar a chamada (endpoint indisponível, etc.), não bloqueia
      console.warn(`[crm] erro ao checar canal "${channelName}":`, (err as Error).message);
      return true;
    }
  },
};

// ─── Escalação para humano (padrão recomendado pela API doc) ──────────────────

export async function escalateToHuman(leadId: string, channel: string): Promise<void> {
  // 1. Verifica agente disponível
  const agent = await users.findOnlineAgent();

  // 2. Desativa bot
  await leads.setBotMode(leadId, false);

  // 3. Atribui ao agente (se disponível)
  if (agent) {
    await leads.assign(leadId, agent.id);
  }

  // 4. Avisa o cliente
  await messages.send(leadId,
    agent
      ? `Vou passar você para o time responsável agora mesmo. Já já alguém vai te direcionar para concluir o atendimento! 🙌`
      : `Nossa equipe será notificada em instantes para te dar continuidade no atendimento! 🙌`
  );

  console.log(`[crm] lead ${leadId} escalado para humano. agente: ${agent?.name ?? 'nenhum online'}`);
}
