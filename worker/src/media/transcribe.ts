/**
 * Transcrição de áudio via OpenAI Whisper.
 *
 * Usado quando o cliente manda áudio via WhatsApp:
 *   webhook detecta áudio → baixa o arquivo → transcribe → usa texto no loop
 *
 * Custo aproximado: $0.006/minuto. Áudios típicos de WhatsApp = 10-30s = ~$0.002 cada.
 */

import OpenAI from 'openai';

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
 * Baixa o áudio da URL e transcreve via Whisper.
 *
 * @param audioUrl URL pública do arquivo de áudio (ogg/opus, mp3, m4a, webm, etc.)
 * @param apiKey OpenAI API key (opcional — usa env como fallback)
 * @returns texto transcrito ou null se falhar
 */
export async function transcribeAudio(
  audioUrl: string,
  apiKey?: string,
): Promise<string | null> {
  try {
    const start = Date.now();

    // Baixa o arquivo
    const fetchRes = await fetch(audioUrl);
    if (!fetchRes.ok) {
      console.warn(`[transcribe] download falhou: HTTP ${fetchRes.status} url=${audioUrl}`);
      return null;
    }
    const buf = Buffer.from(await fetchRes.arrayBuffer());

    // Inferir extensão a partir da URL ou content-type
    const contentType = fetchRes.headers.get('content-type') ?? '';
    const ext = inferAudioExt(audioUrl, contentType);
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
    console.log(`[transcribe] ok durationMs=${ms} chars=${text.length}`);
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
