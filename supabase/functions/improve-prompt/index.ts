// Edge Function: improve-prompt — reescreve a mensagem do usuário num prompt mais
// claro e estruturado, SEM responder (só melhora a redação/intenção). Devolve o
// texto reescrito pro painel jogar no campo de input pra revisão antes de reenviar.
// Lê a chave OpenAI de agent_voice_config (service role); cai pra env OPENAI_API_KEY.
// gpt-4o-mini (rápido/barato).
//
// Deploy: supabase functions deploy improve-prompt

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = [
  'Você reescreve a mensagem do usuário transformando-a num PROMPT mais claro, direto e bem estruturado.',
  'NÃO responda à pergunta nem execute a tarefa — apenas REESCREVA a mensagem.',
  'Preserve 100% da intenção, do contexto e dos dados (nomes, números, nomes de sistema). Não invente nada novo.',
  'Mantenha o MESMO idioma do original (normalmente PT-BR). Mantenha tom de quem pede algo a um assistente.',
  'Deixe objetivo: explicite o que se quer, com que formato/critério quando der pra inferir do próprio texto.',
  'Saída: SOMENTE o texto reescrito, sem aspas, sem markdown, sem preâmbulo ("Aqui está:"), sem comentários.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { agentId?: string; text?: string };
  try { body = await req.json(); } catch { return json({ error: 'json inválido' }, 400); }
  const { agentId, text } = body;
  if (!agentId || typeof agentId !== 'string' || agentId.length > 100) return json({ error: 'agentId inválido' }, 400);
  const original = (typeof text === 'string' ? text : '').trim();
  if (!original) return json({ error: 'texto vazio' }, 400);
  if (original.length > 4000) return json({ error: 'texto muito longo' }, 400);

  // Chave OpenAI: prefere a do agente (agent_voice_config); cai pra env global.
  const admin = createClient(url, serviceKey);
  const { data: cfg } = await admin.from('agent_voice_config').select('provider,api_key').eq('agent_id', agentId).maybeSingle();
  const apiKey = (cfg?.provider === 'openai' && cfg?.api_key) ? cfg.api_key : Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'sem chave OpenAI configurada' }, 400);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: original.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return json({ error: `openai ${r.status}`, detail: detail.slice(0, 200) }, 502);
    }
    const data = await r.json();
    const improved = (data?.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
    return json({ improved }, 200);
  } catch (e) {
    return json({ error: (e as Error).name === 'AbortError' ? 'timeout' : 'falha ao chamar OpenAI' }, 502);
  } finally {
    clearTimeout(to);
  }
});
