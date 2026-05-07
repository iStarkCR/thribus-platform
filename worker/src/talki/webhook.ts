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
import { bufferEnqueue } from '../agent/buffer.js';
import { db } from '../db/index.js';
import * as talki from './client.js';
import { transcribeAudio } from '../media/transcribe.js';

// ⚠️ SAFETY: só processa conversas que tenham essa label aplicada no Talki.
// Configurar no Coolify:
//   TALKI_REQUIRED_LABEL=testando-agente   (default vazio = sem requisito de label)
const REQUIRED_LABEL = (process.env.TALKI_REQUIRED_LABEL ?? '').trim();

interface ChatwootAttachment {
  id?: number;
  message_id?: number;
  file_type?: string; // 'image' | 'audio' | 'video' | 'file' | 'location' | 'fallback'
  account_id?: number;
  data_url?: string;
  thumb_url?: string;
  file_size?: number;
}

interface ChatwootWebhookPayload {
  event: string; // 'message_created', etc.
  id?: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 'activity' | 'template' | number;
  content_type?: string;
  attachments?: ChatwootAttachment[];
  conversation?: {
    id: number;
    inbox_id: number;
    status: string;
    labels?: string[];   // labels aplicadas na conversa
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

    // Extrai anexos (imagens, áudios, etc.) — adicionamos URL ao content
    const attachments = payload.attachments ?? [];
    const imageAttachment = attachments.find((a) => a.file_type === 'image' && a.data_url);
    const audioAttachment = attachments.find((a) => a.file_type === 'audio' && a.data_url);

    let content = payload.content?.trim() ?? '';

    if (imageAttachment?.data_url) {
      const imgTag = `[image_url: ${imageAttachment.data_url}]`;
      content = content ? `${content}\n${imgTag}` : imgTag;
    }
    if (audioAttachment?.data_url) {
      const audioTag = `[audio_url: ${audioAttachment.data_url}]`;
      content = content ? `${content}\n${audioTag}` : audioTag;
    }

    if (!content.trim()) {
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

      // Carrega workspace se agent estiver vinculado (multi-tenant)
      const workspace = agent.workspaceId
        ? await db.workspaces.findById(agent.workspaceId).catch(() => null)
        : null;

      // ⚠️ SAFETY: checa label obrigatória, se configurada
      // Prioridade: workspace.talki_required_label > env var
      const requiredLabel = (workspace?.talkiRequiredLabel ?? REQUIRED_LABEL).trim();
      if (requiredLabel) {
        let labels = conv.labels ?? [];
        if (labels.length === 0) {
          const cfg = talki.configFromWorkspace(workspace ?? undefined);
          labels = await talki.conversations.listLabels(conv.id, cfg);
        }
        const hasLabel = labels.some(
          (l) => l.toLowerCase() === requiredLabel.toLowerCase(),
        );
        if (!hasLabel) {
          console.log(
            `[talki-webhook] conv ${conv.id} sem label "${requiredLabel}" (tem: ${labels.join(',') || 'nenhuma'}) — ignorando`,
          );
          return;
        }
      }

      // Dedup
      if (payload.id !== undefined) {
        const exists = await db.messages.exists(String(payload.id));
        if (exists) {
          console.log(`[talki-webhook] dedup msgId=${payload.id}`);
          return;
        }
      }

      // ── Áudio in: transcreve via Whisper antes de enfileirar ────────────
      let finalContent = content;
      if (audioAttachment?.data_url) {
        const transcribed = await transcribeAudio(
          audioAttachment.data_url,
          workspace?.llmApiKey,
        );
        if (transcribed) {
          // Substitui o tag [audio_url: ...] pelo texto transcrito.
          // O agente vê uma mensagem normal com prefixo [áudio] pra contexto.
          finalContent = finalContent.replace(
            /\[audio_url:\s*[^\]]+\]/g,
            `[áudio do cliente] ${transcribed}`,
          ).trim();
          console.log(`[talki-webhook] audio transcribed convId=${conv.id} chars=${transcribed.length}`);
        } else {
          // Se a transcrição falhou, troca o tag por um placeholder claro
          finalContent = finalContent.replace(
            /\[audio_url:\s*[^\]]+\]/g,
            '[cliente enviou áudio — transcrição indisponível]',
          ).trim();
        }
      }

      bufferEnqueue({
        agentId: agent.id,
        leadId: String(conv.id), // conversation_id no Chatwoot
        messageId: String(payload.id ?? `talki-${Date.now()}`),
        customerPhone: sender?.phone_number ?? '',
        customerName: sender?.name,
        content: finalContent,
        messageType: payload.content_type ?? (imageAttachment ? 'image' : audioAttachment ? 'audio' : 'text'),
        channel: channelKey,
        leadStage: conv.status,
      });
    });
  });

  return router;
}
