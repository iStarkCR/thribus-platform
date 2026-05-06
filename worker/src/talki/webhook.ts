/**
 * Webhook receiver — Talki / Chatwoot
 *
 * Chatwoot dispara webhook em vários eventos. O que importa pra nós:
 *   - message_created (com message_type='incoming') → mensagem do cliente
 *
 * Configurar webhook no Talki:
 *   Profile Settings → Webhooks (ou Inbox → Configurações → Webhook)
 *   URL: https://worker.thribustech.com/webhook/talki
 *   Eventos: message_created
 *
 * Auth: Chatwoot não assina webhook por padrão. Se quiser segurança extra,
 * configure um secret e verifique header `X-Chatwoot-Signature` (opcional).
 */

import express, { Router, type Request, type Response } from 'express';
import { enqueue } from '../queue/index.js';
import { db } from '../db/index.js';

interface ChatwootWebhookPayload {
  event: string; // 'message_created', etc.
  id?: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 'activity' | 'template' | number;
  content_type?: string;
  conversation?: {
    id: number;
    inbox_id: number;
    status: string;
    contact_inbox?: {
      contact_id: number;
    };
    meta?: {
      sender?: {
        id: number;
        name: string;
        phone_number?: string;
        identifier?: string;
      };
    };
  };
  inbox?: { id: number; name: string };
  sender?: {
    id: number;
    name: string;
    type?: string; // 'contact' | 'user'
    phone_number?: string;
  };
  account?: { id: number };
  created_at?: string;
}

export function createTalkiWebhookRouter(): Router {
  const router = Router();

  router.post('/talki', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
    const payload = req.body as ChatwootWebhookPayload;

    console.log(`[talki-webhook] event=${payload.event} message_type=${payload.message_type}`);

    // Eventos válidos: message_incoming (já filtrado) ou message_created (precisa filtrar)
    const isMessageEvent =
      payload.event === 'message_incoming' || payload.event === 'message_created';

    if (!isMessageEvent) {
      res.json({ skipped: 'wrong_event' });
      return;
    }

    // Garantir que é incoming (cliente → empresa)
    const isIncoming =
      payload.event === 'message_incoming' ||
      payload.message_type === 'incoming' ||
      payload.message_type === 0;

    if (!isIncoming) {
      res.json({ skipped: 'not_incoming' });
      return;
    }

    if (!payload.content?.trim()) {
      res.json({ skipped: 'no_content' });
      return;
    }

    if (!payload.conversation || !payload.inbox) {
      res.json({ skipped: 'no_conversation_or_inbox' });
      return;
    }

    // ACK imediato pro Chatwoot
    res.json({ received: true });

    // Processa async
    setImmediate(async () => {
      const conv = payload.conversation!;
      const inbox = payload.inbox!;
      const sender = payload.sender;

      // Acha o agent pelo inbox_id (campo `channel` na nossa tabela armazena
      // o identificador do canal — pra Talki usamos `talki:5:INBOX_ID`)
      const channelKey = `talki:${payload.account?.id ?? ''}:${inbox.id}`;
      const agent = await db.agents.findByChannel(channelKey);
      if (!agent) {
        console.warn(`[talki-webhook] nenhum agent para channel=${channelKey}`);
        return;
      }

      // Dedup
      if (payload.id !== undefined) {
        const exists = await db.messages.exists(String(payload.id));
        if (exists) {
          console.log(`[talki-webhook] dedup msgId=${payload.id}`);
          return;
        }
      }

      enqueue({
        agentId: agent.id,
        leadId: String(conv.id), // conversation_id no Chatwoot
        messageId: String(payload.id ?? `talki-${Date.now()}`),
        customerPhone: sender?.phone_number ?? '',
        customerName: sender?.name,
        content: payload.content!,
        messageType: payload.content_type ?? 'text',
        channel: channelKey,
        leadStage: conv.status,
      });
    });
  });

  return router;
}
