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

  async list(opts: { channel?: string; limit?: number; search?: string } = {}, cfg?: TexNetConfig): Promise<Lead[]> {
    const params = new URLSearchParams();
    if (opts.channel) params.set('channel', opts.channel);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.search) params.set('search', opts.search);
    const qs = params.toString();
    const path = qs ? `/leads?${qs}` : '/leads';
    const result = await req<Lead[] | { data: Lead[] }>('GET', path, undefined, cfg);
    return Array.isArray(result) ? result : (result.data ?? []);
  },

  async update(id: string, data: Partial<{
    name: string; email: string; value: number;
    notes: string; tags: string[]; stage: LeadStage;
    responsibleId: string | null;
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

  /**
   * Envia mídia (áudio, imagem, documento) pelo endpoint POST /messages/media.
   *
   * O TexNet API aceita o conteúdo em base64 (com ou sem prefixo data:...).
   * Pra áudio, recomenda-se ogg/opus (formato PTT do WhatsApp).
   *
   * Áudios .webm são automaticamente convertidos pra .ogg/opus pelo TexNet
   * pra compatibilidade com WhatsApp.
   */
  async sendMedia(
    leadId: string,
    payload: {
      content: string;       // base64 (com ou sem data: prefix)
      fileName: string;      // ex: "resposta.ogg"
      mediaType: 'audio' | 'image' | 'video' | 'document' | 'pdf';
      caption?: string;
    },
    cfg?: TexNetConfig,
  ): Promise<LeadMessage> {
    return req<LeadMessage>(
      'POST',
      `/leads/${leadId}/messages/media`,
      payload,
      cfg,
    );
  },

  /**
   * Atalho: envia áudio TTS gerado pra cliente. Wrapper de sendMedia.
   *
   * @param leadId ID do lead no TexNet
   * @param audioBuffer Buffer do áudio (formato ogg/opus de preferência)
   * @param opts filename + mimeType
   */
  async sendAudio(
    leadId: string,
    audioBuffer: Buffer,
    opts: { filename: string; mimeType: string },
    cfg?: TexNetConfig,
  ): Promise<LeadMessage> {
    const base64 = audioBuffer.toString('base64');
    const dataUri = `data:${opts.mimeType};base64,${base64}`;
    return this.sendMedia(
      leadId,
      {
        content: dataUri,
        fileName: opts.filename,
        mediaType: 'audio',
      },
      cfg,
    );
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
//
// Comportamento desejado:
//   1. Bot para de responder (botMode=false)
//   2. Lead vai pra fila aberta "aguardando" (stage=aguardando, SEM responsável)
//   3. Cliente recebe mensagem informativa
//
// IMPORTANTE: NÃO atribuímos automaticamente a um agente. O time da Texnet
// pega da fila quando puder. Atribuir aqui faria a conversa ir direto pra
// "Em atendimento" com agente específico, pulando a fila.

export async function escalateToHuman(leadId: string, channel: string, cfg?: TexNetConfig): Promise<void> {
  // 1. Bot para de responder
  await leads.setBotMode(leadId, false, cfg);

  // 2. Move pra fila aguardando + desvincula responsável NUMA ÚNICA chamada PATCH.
  // Antes usávamos assign('') mas TexNet rejeita string vazia (responsibleId é
  // obrigatório no endpoint /assign). PATCH /leads/:id com responsibleId: null
  // funciona pra ambos numa atomic op.
  try {
    await leads.update(
      leadId,
      { stage: 'aguardando', responsibleId: null },
      cfg,
    );
    console.log(`[crm] lead ${leadId} → stage=aguardando, responsibleId=null`);
  } catch (err) {
    // Fallback: se a API recusar o PATCH combinado, tenta passos separados
    console.warn(`[crm] update combinado falhou pra lead ${leadId}:`, (err as Error).message);
    try {
      await leads.update(leadId, { stage: 'aguardando' }, cfg);
    } catch (e2) {
      console.warn(`[crm] update stage=aguardando falhou:`, (e2 as Error).message);
    }
    // Não tentamos assign('') — sabidamente falha. Lead fica com responsável
    // anterior; a fila pode filtrar por stage=aguardando e ignorar atribuição.
  }

  // 3. Mensagem ao cliente
  await messages.send(leadId,
    'Vou passar você para o time responsável agora mesmo. Já já alguém vai te direcionar para concluir o atendimento! 🙌',
    cfg,
  );
  console.log(`[crm] lead ${leadId} escalado pra fila aguardando`);
}
