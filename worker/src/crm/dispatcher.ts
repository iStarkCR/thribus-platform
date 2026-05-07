/**
 * CRM Dispatcher — escolhe o provider correto baseado no agent.
 *
 * O channel field no Supabase identifica o provider:
 *   - "texnet-duall"           → TexNet
 *   - "talki:5:42"             → Talki (account 5, inbox 42)
 *
 * Loop usa esses helpers em vez de chamar TexNet/Talki direto.
 */

import * as texnet from './client.js';
import * as talki from '../talki/client.js';

export type Provider = 'texnet' | 'talki';

export function detectProvider(channel: string): Provider {
  if (channel.startsWith('talki:')) return 'talki';
  return 'texnet'; // default
}

// ─── Interface unificada ──────────────────────────────────────────────────────

export interface UnifiedLead {
  id: string;          // string em ambos
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

export async function getLead(channel: string, leadId: string): Promise<UnifiedLead> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    const conv = await talki.conversations.get(Number(leadId));
    const msgsRes = await talki.conversations.listMessages(Number(leadId));
    const msgs = msgsRes.payload ?? [];

    return {
      id: String(conv.id),
      name: conv.contact?.name ?? conv.meta?.sender?.name ?? 'Desconhecido',
      phone: conv.contact?.phone_number ?? conv.meta?.sender?.phone_number ?? '',
      channel,
      stage: conv.status,
      // Talki/Chatwoot:
      //   open    → bot atua
      //   pending → bot atua (cliente ainda esperando, label-gate já validou)
      //   snoozed → bot atua
      //   resolved → bot NÃO atua (humano fechou)
      // O label `testando-agente` (TALKI_REQUIRED_LABEL) é o gate principal
      // antes do webhook chegar aqui. Aqui só protege contra responder em
      // conversa explicitamente resolved.
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
  const lead = await texnet.leads.get(leadId);
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

export async function sendMessage(channel: string, leadId: string, content: string): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    await talki.messages.send(Number(leadId), content);
    return;
  }

  await texnet.messages.send(leadId, content);
}

// ─── Channel connected check ─────────────────────────────────────────────────

export async function isChannelConnected(channel: string): Promise<boolean> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    // Talki não tem endpoint de "channel status" simples — assume true
    return true;
  }

  return texnet.channels.isConnected(channel);
}

// ─── Set bot mode (activate/deactivate) ───────────────────────────────────────

export async function setBotMode(channel: string, leadId: string, enabled: boolean): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    // Em Talki: bot mode = open status. Quando desativar bot, marca como pending (humano vai pegar)
    await talki.conversations.setStatus(Number(leadId), enabled ? 'open' : 'pending');
    return;
  }

  await texnet.leads.setBotMode(leadId, enabled);
}

// ─── Escalate to human ────────────────────────────────────────────────────────

export async function escalateToHuman(channel: string, leadId: string): Promise<void> {
  const provider = detectProvider(channel);

  if (provider === 'talki') {
    // Marca conversa como pending (humano assume)
    await talki.conversations.setStatus(Number(leadId), 'pending');
    await talki.messages.send(
      Number(leadId),
      'Vou passar você para o time responsável agora mesmo. Já já alguém vai te direcionar para concluir o atendimento! 🙌',
    );
    return;
  }

  await texnet.escalateToHuman(leadId, channel);
}
