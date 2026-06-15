// Edge Function: tts — text-to-speech conforme a skill de Voz do colaborador.
// Lê agent_voice_config (service role). ElevenLabs ou OpenAI. Retorna audio/mpeg.
// Se provider=browser/desabilitado → 200 { provider:'browser' } (front usa voz nativa).
//
// Deploy: supabase functions deploy tts

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  const { data: cfg } = await admin.from('agent_voice_config').select('*').eq('agent_id', agentId).maybeSingle();

  if (!cfg || !cfg.enabled || cfg.provider === 'browser' || !cfg.api_key) {
    return json({ provider: 'browser' }, 200); // front fala com voz nativa
  }

  try {
    if (cfg.provider === 'elevenlabs') {
      const voice = cfg.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: { 'xi-api-key': cfg.api_key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: cfg.model || 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!r.ok) return json({ error: `elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}` }, 400);
      return new Response(await r.arrayBuffer(), { headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
    }
    if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model || 'tts-1', voice: cfg.voice_id || 'nova', input: text }),
      });
      if (!r.ok) return json({ error: `openai ${r.status}: ${(await r.text()).slice(0, 200)}` }, 400);
      return new Response(await r.arrayBuffer(), { headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  return json({ provider: 'browser' }, 200);
});
