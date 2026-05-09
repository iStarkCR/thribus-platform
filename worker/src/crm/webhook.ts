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
import { transcribeAudio } from '../media/transcribe.js';

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
//
// Multi-tenant: tenta a chave de cada workspace TexNet ativo no DB.
// Fallback: TEXNET_API_KEY do env (dev / setup inicial sem workspaces).

function sigFromKey(key: string): string {
  return Buffer.from(key).toString('base64').slice(0, 16);
}

async function verifySignature(signature: string | undefined): Promise<boolean> {
  if (!signature) {
    // Sem signature: aceita só se nem env nem workspaces estiverem configurados
    const envKey = process.env.TEXNET_API_KEY;
    const workspaces = await db.workspaces.listByCrmProvider('texnet').catch(() => []);
    return !envKey && workspaces.length === 0;
  }

  // 1) Tenta chave do env (back-compat)
  const envKey = process.env.TEXNET_API_KEY;
  if (envKey && signature === sigFromKey(envKey)) return true;

  // 2) Tenta chave de cada workspace TexNet
  const workspaces = await db.workspaces.listByCrmProvider('texnet').catch(() => []);
  for (const ws of workspaces) {
    if (ws.crmApiToken && signature === sigFromKey(ws.crmApiToken)) return true;
  }

  return false;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createWebhookRouter(): Router {
  const router = Router();

  router.post('/texnet', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
    console.log(`[webhook] received event=${req.body?.event} from ${req.ip}`);
    console.log(`[webhook] PAYLOAD:`, JSON.stringify(req.body, null, 2));

    // 1. Validar assinatura (tenta env + cada workspace TexNet)
    const sigOk = await verifySignature(req.headers['x-texnet-signature'] as string);
    if (!sigOk) {
      console.warn('[webhook] assinatura inválida — rejeitando 401');
      res.status(401).json({ error: 'invalid signature' });
      return;
    }

    const payload = req.body as TexNetWebhookPayload;

    // 2. Só processa message.received com direction=inbound.
    //    message.sent é a saída do próprio CRM (incluindo nossas respostas) —
    //    processar isso causaria loop infinito.
    //    Áudios podem ter content vazio ou data URI — não filtra por content
    //    aqui; quem decide é a transcrição lá embaixo.
    if (
      payload.event !== 'message.received' ||
      payload.data?.message?.direction !== 'inbound'
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

      // Resolve workspace pra pegar API key da OpenAI
      const workspace = agent.workspaceId
        ? await db.workspaces.findById(agent.workspaceId).catch(() => null)
        : null;

      // ── Áudio in: transcreve via Whisper antes de enfileirar ─────────────
      let finalContent = (message.content ?? '').trim();

      if (message.type === 'audio') {
        // TexNet entrega áudio como data URI (data:audio/ogg;base64,...) ou URL.
        // No canal Evolution Web (texnet-testeti) chega data URI. No 360dialog
        // (texnet-duall) o formato é diferente — observado em prod (lead Rita,
        // canal texnet-duall, 09/05/2026). Quando cair no fallback, logamos o
        // payload bruto pra descobrir o formato e implementar suporte.
        const audioSource = message.content;
        if (audioSource && (audioSource.startsWith('data:') || audioSource.startsWith('http'))) {
          console.log(`[webhook] áudio detectado lead=${lead.id} channel=${lead.channel} — transcrevendo`);
          const transcribed = await transcribeAudio(audioSource, workspace?.llmApiKey);
          if (transcribed) {
            finalContent = `[áudio do cliente] ${transcribed}`;
            console.log(`[webhook] audio transcribed lead=${lead.id} chars=${transcribed.length}`);
          } else {
            finalContent = '[cliente enviou áudio — transcrição indisponível]';
            console.warn(`[webhook] audio transcription falhou lead=${lead.id}`);
          }
        } else {
          // Formato não suportado — log verboso pra investigar e implementar.
          // Não vaza áudio inteiro (pode ser MB), mas mostra prefixo e tamanho.
          const preview = typeof audioSource === 'string' ? audioSource.slice(0, 200) : `<${typeof audioSource}>`;
          const totalLen = typeof audioSource === 'string' ? audioSource.length : 0;
          console.warn(
            `[webhook] AUDIO FORMATO NAO RECONHECIDO lead=${lead.id} channel=${lead.channel} ` +
            `messageId=${message.id} contentType=${typeof audioSource} length=${totalLen} ` +
            `preview="${preview}"`,
          );
          finalContent = '[cliente enviou áudio — formato não reconhecido]';
        }
      } else if (!finalContent) {
        // Texto vazio em mensagem não-áudio — pula
        console.log(`[webhook] message ${message.id} sem conteúdo textual — skipping`);
        return;
      }

      bufferEnqueue({
        agentId: agent.id,
        leadId: lead.id,
        messageId: message.id,
        customerPhone: lead.phone,
        customerName: lead.name,
        content: finalContent,
        messageType: message.type,
        channel: lead.channel,
        leadStage: lead.stage,
      });
    });
  });

  return router;
}
