// Edge Function: voice-ack — aviso curto e CONTEXTUAL ("já vou ver isso") falado
// no modo voz ANTES da resposta pesada, pra não ficar mudo enquanto processa.
// Espelha o QUICK-ACK do daemon do WhatsApp, mas via OpenAI gpt-4o-mini (rápido).
// Lê a chave OpenAI de agent_voice_config (service role). Retorna { ack }.
//
// Deploy: supabase functions deploy voice-ack

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = [
  'Você é o Bukowiski, COO da Thribus, falando por VOZ com o Charles.',
  'Ele acabou de te pedir algo que vai levar alguns segundos pra processar.',
  'Gere APENAS um aviso curto, natural e humano — UMA frase, no máx ~14 palavras —',
  'confirmando que recebeu e já está no caso, ESPECÍFICO ao que ele pediu.',
  'NÃO resolva o pedido, NÃO dê a resposta, NÃO faça pergunta, NÃO invente dado.',
  'Só o aviso. PT-BR, texto puro, sem aspas, sem markdown. Soa bem falado em voz alta.',
  'Exemplos de tom (não copie): "Boa, já vou levantar isso pra você." /',
  '"Deixa comigo, checando agora." / "Saquei, já começo. Volto já."',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { text?: string; agentId?: string };
  try { body = await req.json(); } catch { return json({ error: 'json inválido' }, 400); }
  const { text, agentId } = body;
  if (!text || !agentId) return json({ error: 'text e agentId são obrigatórios' }, 400);

  const admin = createClient(url, serviceKey);
  const { data: cfg } = await admin.from('agent_voice_config').select('provider,api_key').eq('agent_id', agentId).maybeSingle();
  // Só gera ack quando há chave OpenAI (mesma usada no TTS). Sem ela → sem ack.
  if (!cfg || cfg.provider !== 'openai' || !cfg.api_key) return json({ ack: '' }, 200);

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 40,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: String(text).slice(0, 600) },
        ],
      }),
    });
    if (!r.ok) return json({ ack: '' }, 200); // falhou → sem ack (não quebra a voz)
    const data = await r.json();
    const ack = (data?.choices?.[0]?.message?.content ?? '').trim();
    return json({ ack }, 200);
  } catch {
    return json({ ack: '' }, 200);
  }
});
