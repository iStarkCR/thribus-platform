/**
 * TexNet CRM API Client
 *
 * Base URL: https://texcrm.texnet.com.br/api/v1
 * Auth: header x-api-key (formato txn_<32-64 chars>)
 * Docs: TexNet API Reference v1
 *
 * Multi-tenant: cada chamada aceita TexNetConfig opcional.
 * Se vazio, faz fallback nas env vars (TEXNET_BASE_URL / TEXNET_API_KEY).
 */

import type { WorkspaceRecord } from '../db/index.js';

const DEFAULT_BASE = 'https://texcrm.texnet.com.br/api/v1';

export interface TexNetConfig {
  baseUrl: string;
  apiKey: string;
}

function fromEnv(): TexNetConfig {
  return {
    baseUrl: process.env.TEXNET_BASE_URL ?? DEFAULT_BASE,
    apiKey: process.env.TEXNET_API_KEY ?? '',
  };
}

export function configFromWorkspace(ws?: WorkspaceRecord): TexNetConfig {
  const env = fromEnv();
  return {
    baseUrl: ws?.crmBaseUrl || env.baseUrl,
    apiKey: ws?.crmApiToken || env.apiKey,
  };
}

async function req<T>(method: string, path: string, body?: unknown, cfg: TexNetConfig = fromEnv()): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
    },
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
  async get(id: string, cfg?: TexNetConfig): Promise<Lead> {
    return req<Lead>('GET', `/leads/${id}`, undefined, cfg);
  },

  async list(opts: { channel?: string; limit?: number } = {}, cfg?: TexNetConfig): Promise<Lead[]> {
    const params = new URLSearchParams();
    if (opts.channel) params.set('channel', opts.channel);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = qs ? `/leads?${qs}` : '/leads';
    const result = await req<Lead[] | { data: Lead[] }>('GET', path, undefined, cfg);
    return Array.isArray(result) ? result : (result.data ?? []);
  },

  async update(id: string, data: Partial<{
    name: string; email: string; value: number;
    notes: string; tags: string[]; stage: LeadStage;
  }>, cfg?: TexNetConfig): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}`, data, cfg);
  },

  async moveStage(id: string, stage: LeadStage, cfg?: TexNetConfig): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}/stage`, { stage }, cfg);
  },

  async assign(id: string, responsibleId: string, cfg?: TexNetConfig): Promise<Lead> {
    return req<Lead>('PATCH', `/leads/${id}/assign`, { responsibleId }, cfg);
  },

  async setBotMode(id: string, enabled: boolean, cfg?: TexNetConfig): Promise<{ id: string; botMode: boolean }> {
    return req('PATCH', `/leads/${id}/bot-mode`, { enabled }, cfg);
  },
};

// ─── Mensagens ────────────────────────────────────────────────────────────────

export const messages = {
  async send(leadId: string, content: string, cfg?: TexNetConfig): Promise<LeadMessage> {
    return req<LeadMessage>('POST', `/leads/${leadId}/messages`, { content, type: 'text' }, cfg);
  },

  async list(leadId: string, limit = 20, cfg?: TexNetConfig): Promise<{ data: LeadMessage[] }> {
    return req('GET', `/leads/${leadId}/messages?limit=${limit}`, undefined, cfg);
  },
};

// ─── Usuários ─────────────────────────────────────────────────────────────────

export const users = {
  async list(cfg?: TexNetConfig): Promise<CrmUser[]> {
    return req<CrmUser[]>('GET', '/users', undefined, cfg);
  },

  async findOnlineAgent(cfg?: TexNetConfig): Promise<CrmUser | null> {
    const all = await this.list(cfg);
    return all.find((u) => u.role === 'agent' && u.status === 'online') ?? null;
  },
};

// ─── Canais ───────────────────────────────────────────────────────────────────

export const channels = {
  async listWhatsApp(cfg?: TexNetConfig): Promise<Array<{ name: string; status: string; slug?: string }>> {
    return req('GET', '/whatsapp/channels', undefined, cfg);
  },

  async isConnected(channelName: string, cfg?: TexNetConfig): Promise<boolean> {
    try {
      const list = await this.listWhatsApp(cfg);
      const ch = list.find(
        (c) => c.name === channelName || c.slug === channelName,
      );

      if (!ch) {
        console.warn(`[crm] canal "${channelName}" não encontrado em /whatsapp/channels — assumindo conectado`);
        return true;
      }

      const ok = ['connected', 'active', 'ativo', 'online', 'ready'];
      const status = (ch.status ?? '').toLowerCase();
      const isOk = ok.includes(status);

      if (!isOk) {
        console.warn(`[crm] canal "${channelName}" status="${ch.status}" — não está em ${ok.join('|')}`);
      }
      return isOk;
    } catch (err) {
      console.warn(`[crm] erro ao checar canal "${channelName}":`, (err as Error).message);
      return true;
    }
  },
};

// ─── Escalação para humano (padrão recomendado pela API doc) ──────────────────

export async function escalateToHuman(leadId: string, channel: string, cfg?: TexNetConfig): Promise<void> {
  const agent = await users.findOnlineAgent(cfg);
  await leads.setBotMode(leadId, false, cfg);
  if (agent) {
    await leads.assign(leadId, agent.id, cfg);
  }
  await messages.send(leadId,
    agent
      ? `Vou passar você para o time responsável agora mesmo. Já já alguém vai te direcionar para concluir o atendimento! 🙌`
      : `Nossa equipe será notificada em instantes para te dar continuidade no atendimento! 🙌`,
    cfg,
  );
  console.log(`[crm] lead ${leadId} escalado para humano. agente: ${agent?.name ?? 'nenhum online'}`);
}
