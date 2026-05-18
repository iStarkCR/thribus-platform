/**
 * Edge Function: talki-webhook
 *
 * Recebe POST do Chatwoot/Talki quando há nova msg, conversa, ou mudança
 * de status. Insere em `inbox_conversations` + `inbox_messages`.
 *
 * Setup no Chatwoot:
 *   Settings → Integrations → Webhooks → Add
 *   URL: https://<project>.supabase.co/functions/v1/talki-webhook?workspace=<workspace_uuid>
 *   Events: message_created, conversation_created, conversation_status_changed
 *
 * Auth: query param `workspace` identifica o tenant.
 * Service role key autentica escrita na DB.
 *
 * Deploy:
 *   supabase functions deploy talki-webhook --no-verify-jwt
 */

// @ts-expect-error — Deno runtime (Edge Functions)
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error — Deno global
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno global
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

interface ChatwootPayload {
  event: string;
  id?: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 'template';
  conversation?: ChatwootConversation;
  sender?: { name: string; identifier?: string; email?: string; phone_number?: string };
  meta?: { sender?: { name?: string; phone_number?: string; email?: string } };
}

interface ChatwootConversation {
  id: number;
  status?: 'open' | 'pending' | 'resolved' | 'snoozed';
  channel?: string;
  inbox_id?: number;
  meta?: { sender?: { name?: string; phone_number?: string; email?: string } };
  labels?: string[];
}

// Mapeia channel do Chatwoot pro nosso enum
function mapChannel(ch?: string): 'whatsapp' | 'email' | 'phone' | 'web' | 'instagram' {
  if (!ch) return 'web';
  const c = ch.toLowerCase();
  if (c.includes('whatsapp')) return 'whatsapp';
  if (c.includes('email')) return 'email';
  if (c.includes('voice') || c.includes('phone')) return 'phone';
  if (c.includes('instagram')) return 'instagram';
  return 'web';
}

function mapStatus(s?: string): 'open' | 'pending' | 'escalated' | 'closed' {
  if (s === 'open') return 'open';
  if (s === 'pending') return 'pending';
  if (s === 'snoozed') return 'pending';
  if (s === 'resolved') return 'closed';
  return 'open';
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const workspace_id = url.searchParams.get('workspace');
  if (!workspace_id) {
    return new Response(JSON.stringify({ error: 'missing ?workspace=<uuid>' }), { status: 400 });
  }

  let payload: ChatwootPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const { event } = payload;
  console.log(`[talki-webhook] event=${event} workspace=${workspace_id}`);

  try {
    if (event === 'conversation_created' || event === 'conversation_status_changed') {
      const c = payload.conversation;
      if (!c) return new Response('no conversation', { status: 400 });
      await upsertConversation(workspace_id, c);
    } else if (event === 'message_created') {
      const c = payload.conversation;
      if (!c) return new Response('no conversation', { status: 400 });

      // Upsert conversa primeiro pra ter o id
      const convId = await upsertConversation(workspace_id, c);

      // Insere msg
      await db.from('inbox_messages').insert({
        conversation_id: convId,
        workspace_id,
        external_id: payload.id?.toString(),
        channel: mapChannel(c.channel),
        direction: payload.message_type === 'incoming' ? 'in' : 'out',
        sender_name: payload.sender?.name ?? payload.meta?.sender?.name ?? 'Cliente',
        sender_id: payload.sender?.identifier,
        body: payload.content ?? '',
        is_bot: payload.message_type === 'outgoing' && (payload.sender?.identifier?.startsWith('agent_') ?? false),
        metadata: { event_id: payload.id, raw: payload },
      });
    }

    return new Response(JSON.stringify({ ok: true, event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[talki-webhook] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});

async function upsertConversation(workspace_id: string, c: ChatwootConversation): Promise<string> {
  const sender = c.meta?.sender;
  const payload = {
    workspace_id,
    external_id: c.id.toString(),
    channel: mapChannel(c.channel),
    status: mapStatus(c.status),
    customer_name: sender?.name,
    customer_phone: sender?.phone_number,
    customer_email: sender?.email,
    tags: c.labels ?? [],
    metadata: { inbox_id: c.inbox_id },
    last_activity_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('inbox_conversations')
    .upsert(payload, { onConflict: 'workspace_id,external_id' })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}
