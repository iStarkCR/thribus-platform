// Edge Function: realtime-session — token efêmero (client_secret `ek_...`) da
// OpenAI Realtime API pro modo voz em tempo real do painel. A API key fica só
// aqui (secret); o browser recebe um token de curta duração e abre WebRTC direto
// com a OpenAI (o áudio não passa por nós).
//
// Gated: só super-admin. Substitui o relay /realtime/session do daemon (que
// exigia um shared secret no bundle e só funcionava em localhost).
//
// Secrets: OPENAI_REALTIME_API_KEY (conta isolada thribus-interno),
//          OPENAI_REALTIME_PROJECT_ID (opcional), REALTIME_MODEL (opcional).
// Deploy: supabase functions deploy realtime-session

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const VOICES = new Set(['ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar', 'alloy']);

const TOOLS = [
  {
    type: 'function',
    name: 'perguntar_bukowiski',
    description:
      'Delega ao Bukowiski completo (Claude com acesso a sistemas, dados, memória, código, VPS, clientes, agenda, financeiro). ' +
      'Use SÓ quando precisar de dado ao vivo dos sistemas, memória antiga fora do contexto ou executar uma ação. ' +
      'NÃO use para conversa, opinião, estratégia, brainstorm, explicação ou o que já está no contexto — responda direto. ' +
      'Pode levar de segundos a minutos.',
    parameters: {
      type: 'object',
      properties: {
        pedido: {
          type: 'string',
          description: 'O pedido completo e autocontido, em PT-BR, com todo o contexto necessário da conversa (nomes, números, o que o usuário quer).',
        },
      },
      required: ['pedido'],
    },
  },
  {
    type: 'function',
    name: 'encerrar_voz',
    description: 'Encerra o modo voz quando o usuário pede para parar/sair/desligar a conversa por voz.',
    parameters: { type: 'object', properties: {} },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_super_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'forbidden' }, 403);

  const apiKey = Deno.env.get('OPENAI_REALTIME_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_REALTIME_API_KEY não configurada' }, 503);
  const projectId = Deno.env.get('OPENAI_REALTIME_PROJECT_ID') ?? '';

  let body: { voice?: string; instructions?: string } = {};
  try { body = await req.json(); } catch { /* body opcional */ }
  const voice = body.voice && VOICES.has(body.voice) ? body.voice : 'ash';
  const model = Deno.env.get('REALTIME_MODEL') || 'gpt-realtime';

  const session = {
    type: 'realtime',
    model,
    instructions: typeof body.instructions === 'string' ? body.instructions.slice(0, 16000) : undefined,
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription: {
          model: 'gpt-4o-transcribe',
          language: 'pt',
          prompt: 'Bukowiski. Thribus Tech. Charles Andrade. VPS, Coolify, Vercel, Supabase, Cloudflare, n8n, Evolution. Bianca, CORTEX, Talki, TexNet, Asaas.',
        },
        turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true },
      },
      output: { voice },
    },
    tools: TOOLS,
    tool_choice: 'auto',
  };

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(projectId ? { 'OpenAI-Project': projectId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 600 }, session }),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error('[realtime-session] openai', r.status, text.slice(0, 300));
      return json({ error: `openai ${r.status}`, detail: text.slice(0, 300) }, 502);
    }
    const data = JSON.parse(text);
    return json({ value: data.value, expires_at: data.expires_at, model: data.session?.model ?? model });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
