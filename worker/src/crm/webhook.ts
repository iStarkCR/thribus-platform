/**
 * Webhook receiver — TexNet CRM
 *
 * Documentação: TexNet API Reference v1, seção 9
 *
 * Fluxo:
 *   POST /webhook/texnet
 *     → valida X-TexNet-Signature (base64(api_key).slice(0,16))
 *     → filtra somente event = "message.received" com direction = "inbound"
 *     → checa botMode: se false, humano está atendendo → ignora
 *     → deduplica por message.id
 *     → enfileira AgentJob
 *     → responde 200 imediatamente (CRM tem timeout de 10s e retry 3x)
 */

import express, { Router, type Request, type Response } from 'express';
import { bufferEnqueue } from '../agent/buffer.js';
import { db } from '../db/index.js';

// ─── Tipos do payload TexNet ──────────────────────────────────────────────────

interface TexNetWebhookPayload {
  event: string;
  timestamp: string;
  data: {
    lead: {
      id: string;
      name: string;
      phone: string;
      channel: string;
      stage: string;
      botMode?: boolean;
    };
    message: {
      id: string;
      content: string;
      type: string;
      direction: 'inbound' | 'outbound';
      createdAt: string;
    };
  };
}

// ─── Validação de assinatura ──────────────────────────────────────────────────
// X-TexNet-Signature = primeiros 16 chars do base64 da API Key

function getExpectedSignature(): string {
  const key = process.env.TEXNET_API_KEY ?? '';
  return Buffer.from(key).toString('base64').slice(0, 16);
}

function verifySignature(signature: string | undefined): boolean {
  if (!process.env.TEXNET_API_KEY) return true; // dev sem chave
  if (!signature) return false;
  return signature === getExpectedSignature();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createWebhookRouter(): Router {
  const router = Router();

  router.post('/texnet', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
    console.log(`[webhook] received event=${req.body?.event} from ${req.ip}`);
    console.log(`[webhook] PAYLOAD:`, JSON.stringify(req.body, null, 2));

    // 1. Validar assinatura
    if (!verifySignature(req.headers['x-texnet-signature'] as string)) {
      console.warn('[webhook] assinatura inválida — rejeitando 401');
      res.status(401).json({ error: 'invalid signature' });
      return;
    }

    const payload = req.body as TexNetWebhookPayload;

    // 2. Só processa message.received com direction=inbound e conteúdo de texto.
    //    message.sent é a saída do próprio CRM (incluindo nossas respostas) —
    //    processar isso causaria loop infinito.
    if (
      payload.event !== 'message.received' ||
      payload.data?.message?.direction !== 'inbound' ||
      !payload.data?.message?.content?.trim()
    ) {
      console.log(
        `[webhook] skip event=${payload.event} direction=${payload.data?.message?.direction}`,
      );
      res.json({ skipped: true });
      return;
    }

    // 3. ACK imediato — CRM não espera (timeout 10s, retry 3x)
    res.json({ received: true });

    // 4. Processar assíncrono
    setImmediate(async () => {
      const { lead, message } = payload.data;

      // Ignora se humano está no controle (botMode = false)
      if (lead.botMode === false) {
        console.log(`[webhook] lead ${lead.id} em atendimento humano — ignorando`);
        return;
      }

      // Deduplica por message.id
      const already = await db.messages.exists(message.id);
      if (already) {
        console.log(`[webhook] dedup message_id=${message.id}`);
        return;
      }

      // Descobre qual agent Thribus cuida deste lead
      const agent = await db.agents.findByChannel(lead.channel);
      if (!agent) {
        console.warn(`[webhook] nenhum agent Thribus configurado para channel=${lead.channel}`);
        return;
      }

      bufferEnqueue({
        agentId: agent.id,
        leadId: lead.id,
        messageId: message.id,
        customerPhone: lead.phone,
        customerName: lead.name,
        content: message.content,
        messageType: message.type,
        channel: lead.channel,
        leadStage: lead.stage,
      });
    });
  });

  return router;
}
