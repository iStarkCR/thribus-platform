// Edge Function: transcribe — STT via Whisper (OpenAI). Usa a chave OpenAI da
// agent_voice_config. Só quando provider=openai; senão o front usa STT nativo.
//
// Deploy: supabase functions deploy transcribe

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

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'envie multipart com audio + agentId' }, 400); }
  const file = form.get('audio');
  const agentId = form.get('agentId');
  if (!(file instanceof File) || typeof agentId !== 'string') return json({ error: 'audio (File) e agentId obrigatórios' }, 400);

  const admin = createClient(url, serviceKey);
  const { data: cfg } = await admin.from('agent_voice_config').select('api_key,provider').eq('agent_id', agentId).maybeSingle();
  if (!cfg?.api_key || cfg.provider !== 'openai') {
    return json({ error: 'transcrição Whisper requer provider OpenAI configurado' }, 400);
  }

  const oa = new FormData();
  oa.append('file', file, 'audio.webm');
  oa.append('model', 'whisper-1');
  oa.append('language', 'pt');
  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.api_key}` },
      body: oa,
    });
    if (!r.ok) return json({ error: `whisper ${r.status}: ${(await r.text()).slice(0, 200)}` }, 400);
    const data = await r.json();
    return json({ text: data.text ?? '' });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
