/**
 * CRM Dispatcher — escolhe o provider correto baseado no agent.
 *
 * Multi-tenant: se workspace fornecido, usa as credenciais dele.
 * Senão, fallback nas env vars (single-tenant).
 */

import * as texnet from './client.js';
import * as talki from '../talki/client.js';
import type { WorkspaceRecord } from '../db/index.js';

export type Provider = 'texnet' | 'talki';

export function detectProvider(channel: string): Provider {
  if (channel.startsWith('talki:')) return 'talki';
  return 'texnet';
}

// ─── Interface unificada ──────────────────────────────────────────────────────

export interface UnifiedLead {
  id: string;
  name: string;
  phone: string;
  channel: string;
  stage: string;
  botMode: boolean;
  responsibleId: string | null;
  messages: Array<{
    id: string;
    content: string;
    type: string;
    direction: 'inbound' | 'outbound';
    createdAt: string;
  }>;
}

// ─── Lead get ─────────────────────────────────────────────────────────────────

export async function getLead(channel: string, leadId: string, ws?: WorkspaceRecord): Promise<UnifiedLead> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const cfg = talki.configFromWorkspace(ws);
    const conv = await talki.conversations.get(Number(leadId), cfg);
    const msgsRes = await talki.conversations.listMessages(Number(leadId), cfg);
    const msgs = msgsRes.payload ?? [];

    return {
      id: String(conv.id),
      name: conv.contact?.name ?? conv.meta?.sender?.name ?? 'Desconhecido',
      phone: conv.contact?.phone_number ?? conv.meta?.sender?.phone_number ?? '',
      channel,
      stage: conv.status,
      botMode: conv.status !== 'resolved',
      responsibleId: null,
      messages: msgs.map((m) => {
        const mt = m.message_type as number | string;
        const isIncoming = mt === 0 || mt === 'incoming';
        return {
          id: String(m.id),
          content: m.content ?? '',
          type: m.content_type ?? 'text',
          direction: (isIncoming ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
          createdAt: m.created_at ? new Date(m.created_at * 1000).toISOString() : new Date().toISOString(),
        };
      }),
    };
  }

  // TexNet (default)
  const cfg = texnet.configFromWorkspace(ws);
  const lead = await texnet.leads.get(leadId, cfg);
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    channel: lead.channel ?? channel,
    stage: lead.stage,
    botMode: lead.botMode,
    responsibleId: lead.responsibleId,
    messages: (lead.messages ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      direction: m.direction,
      createdAt: m.createdAt,
    })),
  };
}

// ─── Send message ─────────────────────────────────────────────────────────────

export async function sendMessage(channel: string, leadId: string, content: string, ws?: WorkspaceRecord): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const cfg = talki.configFromWorkspace(ws);
    await talki.messages.send(Number(leadId), content, cfg);
    return;
  }

  const cfg = texnet.configFromWorkspace(ws);
  await texnet.messages.send(leadId, content, cfg);
}

// ─── Channel connected check ─────────────────────────────────────────────────

export async function isChannelConnected(channel: string, ws?: WorkspaceRecord): Promise<boolean> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    return true;
  }

  const cfg = texnet.configFromWorkspace(ws);
  return texnet.channels.isConnected(channel, cfg);
}

// ─── Set bot mode ─────────────────────────────────────────────────────────────

export async function setBotMode(channel: string, leadId: string, enabled: boolean, ws?: WorkspaceRecord): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const cfg = talki.configFromWorkspace(ws);
    await talki.conversations.setStatus(Number(leadId), enabled ? 'open' : 'pending', cfg);
    return;
  }

  const cfg = texnet.configFromWorkspace(ws);
  await texnet.leads.setBotMode(leadId, enabled, cfg);
}

// ─── Escalate to human ────────────────────────────────────────────────────────

export async function escalateToHuman(channel: string, leadId: string, ws?: WorkspaceRecord): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const cfg = talki.configFromWorkspace(ws);
    await talki.conversations.setStatus(Number(leadId), 'pending', cfg);
    await talki.messages.send(
      Number(leadId),
      'Vou passar você para o time responsável agora mesmo. Já já alguém vai te direcionar para concluir o atendimento! 🙌',
      cfg,
    );
    return;
  }

  const cfg = texnet.configFromWorkspace(ws);
  await texnet.escalateToHuman(leadId, channel, cfg);
}

// ─── Internal note (private) ─────────────────────────────────────────────────
// Cria uma nota interna visível só pra agentes (não vai pro cliente).
// Útil pra resumir o atendimento antes de passar pra humano.

export async function addInternalNote(
  channel: string,
  leadId: string,
  content: string,
  ws?: WorkspaceRecord,
): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const cfg = talki.configFromWorkspace(ws);
    await talki.messages.privateNote(Number(leadId), content, cfg);
    return;
  }

  // TexNet: salva como `notes` no lead via PATCH /leads/:id
  // Notes do TexNet são internos por natureza (não enviados ao cliente).
  const cfg = texnet.configFromWorkspace(ws);
  // Concatena com notas existentes pra não sobrescrever
  try {
    const lead = await texnet.leads.get(leadId, cfg);
    const existingNotes = lead.notes ? `${lead.notes}\n\n---\n\n` : '';
    await texnet.leads.update(leadId, { notes: existingNotes + content }, cfg);
  } catch (err) {
    console.warn(`[crm] addInternalNote falhou pra TexNet leadId=${leadId}:`, (err as Error).message);
  }
}
