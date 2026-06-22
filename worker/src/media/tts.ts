/**
 * Text-to-Speech via OpenAI.
 *
 * Usado quando o agente decide responder em áudio (opt-in via flag).
 * Modelo padrão: tts-1 (mais barato), voz "nova" (boa em português).
 *
 * Custo: tts-1 = $15 / 1M chars. Mensagem típica de 200 chars = $0.003.
 */

import OpenAI from 'openai';
import { ttsCostUsd, logAuxCost } from '../llm/cost.js';

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY ?? '';
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new OpenAI({ apiKey: key });
  cachedKey = key;
  return cachedClient;
}

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface TTSOptions {
  /** Voz (default: 'nova' — boa em PT-BR) */
  voice?: TTSVoice;
  /** Modelo (default: tts-1) */
  model?: 'tts-1' | 'tts-1-hd';
  /** Formato de saída (default: opus — compatível com WhatsApp) */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  /** Velocidade 0.25-4.0 (default: 1.0) */
  speed?: number;
  /** API key OpenAI (opcional) */
  apiKey?: string;
}

/**
 * Gera áudio a partir de texto. Retorna Buffer com o conteúdo do áudio.
 */
export async function generateSpeech(
  text: string,
  opts: TTSOptions = {},
): Promise<Buffer | null> {
  if (!text.trim()) return null;
  try {
    const start = Date.now();
    const client = getClient(opts.apiKey);
    const response = await client.audio.speech.create({
      model: opts.model ?? 'tts-1',
      voice: opts.voice ?? 'nova',
      input: text,
      response_format: opts.format ?? 'opus',
      speed: opts.speed,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const ms = Date.now() - start;
    const ttsModel = opts.model ?? 'tts-1';
    logAuxCost('tts', ttsModel, ttsCostUsd(ttsModel, text.length), { chars: text.length, ms });
    console.log(`[tts] ok durationMs=${ms} chars=${text.length} bytes=${buf.length}`);
    return buf;
  } catch (err) {
    console.warn('[tts] erro:', (err as Error).message);
    return null;
  }
}
