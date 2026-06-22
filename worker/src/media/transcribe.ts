/**
 * Transcrição de áudio via OpenAI Whisper.
 *
 * Usado quando o cliente manda áudio via WhatsApp:
 *   webhook detecta áudio → baixa o arquivo → transcribe → usa texto no loop
 *
 * Custo aproximado: $0.006/minuto. Áudios típicos de WhatsApp = 10-30s = ~$0.002 cada.
 */

import OpenAI from 'openai';
import { whisperCostUsd, logAuxCost } from '../llm/cost.js';

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY ?? '';
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new OpenAI({ apiKey: key });
  cachedKey = key;
  return cachedClient;
}

/**
 * Transcreve áudio via Whisper.
 *
 * Aceita 2 formatos de input:
 *  1. URL (`https://...`) — baixa via fetch
 *  2. Data URI base64 (`data:audio/ogg;base64,...`) — decodifica direto.
 *
 * @param audioInput URL ou data URI base64
 * @param apiKey OpenAI API key (opcional — usa env como fallback)
 * @param downloadHeaders Headers extras pro fetch da URL — usado pra autenticar
 *                        downloads que requerem auth (ex: TexNet API
 *                        `/api/v1/leads/<id>/messages/<id>/media` precisa de
 *                        `x-api-key`). Ignorado em data URI.
 * @returns texto transcrito ou null se falhar
 */
export async function transcribeAudio(
  audioInput: string,
  apiKey?: string,
  downloadHeaders?: Record<string, string>,
): Promise<string | null> {
  try {
    const start = Date.now();

    let buf: Buffer;
    let contentType = '';
    let sourceLabel = '';

    if (audioInput.startsWith('data:')) {
      // Data URI: data:<mime>;base64,<payload>
      const match = audioInput.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        console.warn('[transcribe] data URI malformada');
        return null;
      }
      contentType = match[1];
      buf = Buffer.from(match[2], 'base64');
      sourceLabel = `data:${contentType} ${buf.length}b`;
    } else {
      // URL — baixa via fetch (com headers opcionais pra URLs autenticadas)
      const fetchRes = await fetch(audioInput, {
        headers: downloadHeaders,
      });
      if (!fetchRes.ok) {
        console.warn(`[transcribe] download falhou: HTTP ${fetchRes.status} url=${audioInput}`);
        return null;
      }
      buf = Buffer.from(await fetchRes.arrayBuffer());
      contentType = fetchRes.headers.get('content-type') ?? '';
      sourceLabel = `url ${buf.length}b`;
    }

    const ext = inferAudioExt(audioInput, contentType);
    const filename = `audio.${ext}`;

    // Whisper API espera File-like; usamos toFile do SDK
    const { toFile } = await import('openai/uploads.js');
    const file = await toFile(buf, filename);

    const client = getClient(apiKey);
    const result = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });

    const text = (result.text ?? '').trim();
    const ms = Date.now() - start;
    const estSeconds = text.length * 0.08; // estimativa: ~750 chars/min de fala
    logAuxCost('whisper', 'whisper-1', whisperCostUsd(estSeconds), { chars: text.length, estSeconds: Math.round(estSeconds) });
    console.log(`[transcribe] ok ${sourceLabel} durationMs=${ms} chars=${text.length}`);
    return text || null;
  } catch (err) {
    console.warn('[transcribe] erro:', (err as Error).message);
    return null;
  }
}

function inferAudioExt(url: string, contentType: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.opus')) return 'ogg';
  if (lowerUrl.endsWith('.mp3')) return 'mp3';
  if (lowerUrl.endsWith('.m4a')) return 'm4a';
  if (lowerUrl.endsWith('.webm')) return 'webm';
  if (lowerUrl.endsWith('.wav')) return 'wav';

  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'm4a';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('wav')) return 'wav';

  // WhatsApp usualmente é ogg/opus
  return 'ogg';
}
