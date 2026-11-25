/**
 * Realtime Voice — token efêmero da OpenAI Realtime API.
 *
 * O token (`ek_...`, curta duração) vem da edge function `realtime-session`, que
 * valida o JWT do usuário (só super-admin) e guarda a API key como secret. O
 * browser/WKWebView usa o token pra abrir WebRTC direto com a OpenAI.
 */

import { supabase } from '@/lib/supabase';

export const realtimeConfigured = Boolean(supabase);

export interface EphemeralSession {
  value: string; // ek_... token efêmero
  expires_at: number;
  model: string;
}

export async function createRealtimeSession(opts?: {
  voice?: string;
  instructions?: string;
  /** Cliente decide resposta/interrupção após a transcrição (filtra ruído). */
  clientTurns?: boolean;
}): Promise<EphemeralSession> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('realtime-session', { body: opts ?? {} });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.text().catch(() => '') : '';
    throw new Error(`realtime-session: ${error.message}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  const s = data as EphemeralSession;
  if (!s?.value) throw new Error('realtime-session: resposta sem token');
  return s;
}

/**
 * Endpoint WebRTC da OpenAI Realtime API (GA). SDP offer/answer direto com a
 * OpenAI usando o token efêmero — sem proxy de mídia no caminho do áudio.
 */
export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
