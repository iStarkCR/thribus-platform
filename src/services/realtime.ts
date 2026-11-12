/**
 * Realtime Voice — Fase 1 (prova de captura + conexão).
 *
 * Busca um token efêmero (client_secret `ek_...`) da OpenAI Realtime API via
 * relay do daemon Bukowiski (POST /realtime/session). A API key NUNCA chega ao
 * cliente — o relay usa a conta isolada `thribus-interno` e devolve só o token
 * de curta duração, que o browser/WKWebView usa pra abrir o WebRTC direto.
 *
 * Config (.env.local):
 *   VITE_REALTIME_RELAY_URL     — base do daemon (default http://localhost:9999)
 *   VITE_REALTIME_RELAY_SECRET  — shared secret (header X-Internal-Token)
 *
 * AVISO: o secret fica visível no browser. É aceitável só na Fase 1 (painel
 * interno/experimentação). TODO(seg): trocar por JWT do Supabase do usuário
 * antes de ir pra produção — o relay já tem o TODO correspondente no daemon.
 */

const RELAY_URL =
  (import.meta.env.VITE_REALTIME_RELAY_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:9999';
const RELAY_SECRET = (import.meta.env.VITE_REALTIME_RELAY_SECRET as string | undefined) ?? '';

export const realtimeConfigured = Boolean(RELAY_SECRET);

export interface EphemeralSession {
  value: string; // ek_... token efêmero
  expires_at: number;
  model: string;
}

/** Pede ao relay um token efêmero pra abrir a sessão Realtime. */
export async function createRealtimeSession(opts?: {
  model?: string;
  voice?: string;
}): Promise<EphemeralSession> {
  if (!RELAY_SECRET) {
    throw new Error(
      'VITE_REALTIME_RELAY_SECRET não configurado — defina no .env.local.',
    );
  }
  const r = await fetch(`${RELAY_URL}/realtime/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': RELAY_SECRET,
    },
    body: JSON.stringify(opts ?? {}),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`relay ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as EphemeralSession;
}

/**
 * Endpoint WebRTC da OpenAI Realtime API (GA). O cliente faz o SDP offer/answer
 * direto com a OpenAI usando o token efêmero — o relay não fica no caminho do
 * áudio (baixa latência, sem proxy de mídia).
 */
export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
