// Edge Function: provision-user
// Cria um usuário de login (Auth) e o vincula a um workspace com um cargo.
// Gated: só super-admin (app_user_profiles.is_super_admin) pode chamar.
//
// Deploy:  supabase functions deploy provision-user
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1. Confirma que o chamador é super-admin (usa o JWT dele).
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_super_admin');
  if (adminErr) return json({ error: `auth check: ${adminErr.message}` }, 401);
  if (!isAdmin) return json({ error: 'apenas super-admin pode criar usuários' }, 403);

  // 2. Valida payload.
  let body: { email?: string; password?: string; workspaceId?: string; role?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'json inválido' }, 400);
  }
  const { email, password, workspaceId, role = 'member', name } = body;
  if (!email || !password || !workspaceId) {
    return json({ error: 'email, password e workspaceId são obrigatórios' }, 400);
  }
  if (!['owner', 'admin', 'member'].includes(role)) {
    return json({ error: 'role deve ser owner, admin ou member' }, 400);
  }

  // 3. Cria o usuário + vínculo via service role.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name ?? email.split('@')[0] },
  });
  if (createErr) return json({ error: `criar usuário: ${createErr.message}` }, 400);

  const userId = created.user!.id;
  const { error: linkErr } = await admin.from('user_workspaces').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    workspace_id: workspaceId,
    role,
  });
  if (linkErr) {
    // rollback do usuário órfão
    await admin.auth.admin.deleteUser(userId);
    return json({ error: `vincular ao workspace: ${linkErr.message}` }, 400);
  }

  return json({ userId, email, workspaceId, role });
});
