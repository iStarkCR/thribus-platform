/**
 * Edge Function: agent-lab-run
 *
 * Proxy server-side do Agent Lab (playground) pro endpoint sandbox do worker
 * (POST /sandbox/turn). Guarda o ADMIN_SECRET e a WORKER_URL no ambiente da
 * função — o browser NUNCA vê o secret nem fala direto com o worker (que não
 * tem CORS e é gated por x-admin-secret).
 *
 * O worker roda UM turno isolado do agente (mesmo prompt + tools + LLM de
 * produção) SEM efeito colateral: não persiste conversa, não fala com
 * Talki/WhatsApp, não executa tools de verdade. Serve pra simular cenários de
 * conversa antes de conectar o canal real.
 *
 * Body:
 *   { agent_id, messages: [{role,content}], model?, system_prompt? }
 * Retorna (do worker):
 *   { content, latencyMs, tokensUsed, costUsd, toolCalls, availableTools, ... }
 *
 * Env (Supabase → Edge Functions → Secrets):
 *   WORKER_URL                 ex: https://worker.thribus...  (sem barra final)
 *   SANDBOX_ADMIN_SECRET       (fallback: ADMIN_SECRET) — bate com o do worker
 *   SUPABASE_URL / SUPABASE_ANON_KEY — pra validar o usuário chamador
 *
 * Deploy: supabase functions deploy agent-lab-run
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error — Deno
const env = (k: string) => Deno.env.get(k);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface TurnBody {
  agent_id?: string;
  messages?: Array<{ role?: string; content?: string }>;
  model?: string;
  system_prompt?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const WORKER_URL = (env('WORKER_URL') ?? '').replace(/\/+$/, '');
  const ADMIN_SECRET = env('SANDBOX_ADMIN_SECRET') ?? env('ADMIN_SECRET');
  if (!WORKER_URL || !ADMIN_SECRET) {
    return json({ error: 'WORKER_URL / ADMIN_SECRET não configurados na Edge Function' }, 503);
  }

  // Validação leve do chamador (endpoint dispara chamada LLM paga): exige JWT
  // de usuário autenticado da plataforma. O gateway do Supabase já verifica o
  // JWT; aqui confirmamos que resolve pra um user.
  const authHeader = req.headers.get('Authorization') ?? '';
  const SUPABASE_URL = env('SUPABASE_URL');
  const ANON_KEY = env('SUPABASE_ANON_KEY');
  if (SUPABASE_URL && ANON_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await sb.auth.getUser();
      if (error || !data?.user) return json({ error: 'unauthorized' }, 401);
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  let body: TurnBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'json inválido' }, 400);
  }

  const agentId = body.agent_id;
  const messages = body.messages;
  if (!agentId || typeof agentId !== 'string') return json({ error: 'agent_id obrigatório' }, 400);
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages (array não-vazio) obrigatório' }, 400);
  }
  if (messages.length > 40) return json({ error: 'histórico muito longo (máx 40 msgs)' }, 400);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch(`${WORKER_URL}/sandbox/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET },
      body: JSON.stringify({
        agent_id: agentId,
        messages,
        model: body.model,
        system_prompt: body.system_prompt,
      }),
      signal: controller.signal,
    });
    const text = await r.text();
    const payload = text ? JSON.parse(text) : {};
    return json(payload, r.ok ? 200 : r.status);
  } catch (e) {
    const name = (e as Error).name;
    return json({ error: name === 'AbortError' ? 'timeout no worker' : 'falha ao chamar o worker' }, 502);
  } finally {
    clearTimeout(to);
  }
});
