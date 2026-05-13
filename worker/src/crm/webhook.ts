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
import { pickApiKeyByProvider } from '../llm/keys.js';

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
      /**
       * TexNet — desde 2026-05-13: payloads de áudio/imagem/video/document/sticker
       * vêm com este objeto. `url` é HTTPS pública (sem auth) pra fetch direto.
       * Formato content nesses casos é um path relativo legado (não usar pra fetch).
       */
      media?: {
        url: string;
        mime: string;
        type: 'audio' | 'image' | 'video' | 'document' | 'sticker';
      };
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
        // TexNet atualizado em 2026-05-13: agora entrega `message.media.url`
        // (URL pública HTTPS de download) quando o tipo é audio/image/video/document.
        // O campo `message.content` virou path relativo (legado/info, não usar pra fetch).
        //
        // Caminhos suportados (em ordem de preferência):
        //   1. message.media.url — URL HTTPS pública (formato novo, padrão)
        //   2. message.content data URI — formato legado Evolution Web (transitional)
        //   3. message.content URL — formato legado (transitional)
        const audioUrl: string | undefined =
          message.media?.url ??
          (typeof message.content === 'string' &&
            (message.content.startsWith('http') || message.content.startsWith('data:'))
            ? message.content
            : undefined);

        if (audioUrl) {
          console.log(
            `[webhook] áudio detectado lead=${lead.id} channel=${lead.channel} ` +
            `source=${message.media?.url ? 'media.url' : 'content'} ` +
            `mime=${message.media?.mime ?? 'n/a'} — transcrevendo`,
          );
          // Whisper é sempre OpenAI — usa a chave OpenAI específica, não o
          // legacy llmApiKey (que pode estar setado pra Anthropic em workspaces
          // que rodam Claude no agente principal).
          const transcribed = await transcribeAudio(audioUrl, pickApiKeyByProvider('openai', workspace));
          if (transcribed) {
            finalContent = `[áudio do cliente] ${transcribed}`;
            console.log(`[webhook] audio transcribed lead=${lead.id} chars=${transcribed.length}`);
          } else {
            finalContent = '[cliente enviou áudio — transcrição indisponível]';
            console.warn(`[webhook] audio transcription falhou lead=${lead.id} url=${audioUrl.slice(0, 80)}`);
          }
        } else {
          // Sem URL nem data URI — log pra debug + fallback amigável
          const preview = typeof message.content === 'string' ? message.content.slice(0, 200) : `<${typeof message.content}>`;
          console.warn(
            `[webhook] AUDIO SEM MEDIA.URL lead=${lead.id} channel=${lead.channel} ` +
            `messageId=${message.id} content="${preview}" mediaKeys=${JSON.stringify(Object.keys(message.media ?? {}))}`,
          );
          finalContent = '[cliente enviou áudio — formato não reconhecido]';
        }
      } else if (message.type === 'image') {
        // TexNet desde 2026-05-13: image também vem com media.url HTTPS.
        // Agent loop usa `extractImageRefs` que reconhece marker `[image_url: URL]`
        // no content e converte pra Anthropic multimodal blocks automaticamente.
        const imageUrl = message.media?.url;
        if (imageUrl) {
          console.log(
            `[webhook] imagem detectada lead=${lead.id} channel=${lead.channel} ` +
            `mime=${message.media?.mime ?? 'n/a'} url=${imageUrl.slice(0, 80)}`,
          );
          // Caption da imagem (se houver texto junto) vai antes do marker
          const caption = typeof message.content === 'string' && !message.content.startsWith('/media/')
            ? message.content.trim()
            : '';
          finalContent = caption
            ? `${caption}\n[image_url: ${imageUrl}]`
            : `[cliente enviou imagem] [image_url: ${imageUrl}]`;
        } else {
          console.warn(
            `[webhook] IMAGE SEM MEDIA.URL lead=${lead.id} messageId=${message.id}`,
          );
          finalContent = '[cliente enviou imagem — não consegui acessar]';
        }
      } else if (message.type === 'location') {
        // Cliente enviou pin de localização do WhatsApp. Formato varia por canal:
        //  - Evolution: content pode ser "lat,lon" ou JSON { latitude, longitude }
        //  - 360dialog: idem mas pode vir em outros campos do payload
        // Sem reverse geocoding (próximo PR), instruímos o agente a pedir endereço
        // por texto. Logamos o payload bruto pra implementar suporte definitivo.
        const locRaw = message.content;
        const preview = typeof locRaw === 'string' ? locRaw.slice(0, 200) : `<${typeof locRaw}>`;
        console.warn(
          `[webhook] LOCATION lead=${lead.id} channel=${lead.channel} ` +
          `messageId=${message.id} contentType=${typeof locRaw} preview="${preview}"`,
        );
        finalContent =
          '[cliente enviou pin de localização do WhatsApp] ' +
          'INSTRUCAO INTERNA AO AGENTE: O sistema ainda não suporta processar pino de ' +
          'localização. Peça ao cliente educadamente o endereço por texto: "Recebi seu ' +
          'pin! Por enquanto preciso do endereço por texto pra confirmar a cobertura. ' +
          'Pode me passar o CEP + número, ou rua + número + bairro? 🙂"';
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
