// Edge Function: greet — linha de saudação curta e CONTEXTUAL da tela de
// boas-vindas. O topo já mostra "Bom dia, Charles" (pela hora de Brasília);
// esta função gera a CONTINUAÇÃO natural ("como vai?", "o que vamos fazer?") e,
// se houver conversa anterior, relembra a última coisa feita e oferece retomar.
// gpt-4o-mini (rápido/barato). Lê a chave OpenAI de agent_voice_config (service role).
//
// Deploy: supabase functions deploy greet

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = [
  'Você é o Bukowiski, COO (AI) da Thribus, recebendo o Charles no painel.',
  'A saudação "{período}, Charles" JÁ apareceu na tela — NÃO repita "bom dia/boa tarde/boa noite" nem o nome dele.',
  'Gere UMA frase curta, calorosa e natural (máx ~16 palavras) que continue o cumprimento:',
  'pergunte como ele está e/ou o que vão fazer agora.',
  'Se vier "Última conversa", relembre em poucas palavras a última coisa feita e ofereça retomar.',
  'PT-BR, texto puro, sem aspas, sem markdown, sem emoji. Soa bem dito em voz alta. Tom de parceiro direto, não bajulador.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { agentId?: string; name?: string; period?: string; lastContext?: string };
  try { body = await req.json(); } catch { return json({ error: 'json inválido' }, 400); }
  const { agentId, name, period, lastContext } = body;
  if (!agentId || typeof agentId !== 'string' || agentId.length > 100) return json({ error: 'agentId inválido' }, 400);

  const admin = createClient(url, serviceKey);
  const { data: cfg } = await admin.from('agent_voice_config').select('provider,api_key').eq('agent_id', agentId).maybeSingle();
  // Sem chave OpenAI → sem saudação dinâmica (o cliente usa o fallback estático).
  if (!cfg || cfg.provider !== 'openai' || !cfg.api_key) return json({ greeting: '' }, 200);

  // Sanitiza/limita os campos opcionais (defense-in-depth) antes de montar o prompt.
  const clean = (v: unknown, n: number) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, n);
  const sPeriod = clean(period, 20) || 'dia';
  const sName = clean(name, 40) || 'Charles';
  const sCtx = clean(lastContext, 500);
  const userMsg = [
    `Período: ${sPeriod}.`,
    `Nome: ${sName}.`,
    sCtx ? sCtx : 'Sem conversa anterior — é um começo do zero.',
  ].join(' ');

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 8000); // não pendura a tela se a OpenAI travar
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8, // um pouco acima do voice-ack (0.7) — varia mais as saudações
        max_tokens: 70,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg.slice(0, 800) },
        ],
      }),
      signal: controller.signal,
    });
    if (!r.ok) return json({ greeting: '' }, 200);
    const data = await r.json();
    const greeting = (data?.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
    return json({ greeting }, 200);
  } catch {
    return json({ greeting: '' }, 200);
  } finally {
    clearTimeout(to);
  }
});
