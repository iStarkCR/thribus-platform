/**
 * Edge Function: lgpd-erase
 *
 * LGPD Art. 18 V — direito de exclusão. Anonimiza (não deleta) dados
 * pessoais do titular, mantendo registros agregados pra cumprimento
 * de obrigação legal (Art. 16 II).
 *
 * Body: { dsr_id: uuid }
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANON_NAME = 'Titular anonimizado (LGPD)';
const ANON_PHONE = '+55000000000000';
const ANON_EMAIL = 'anonimo@lgpd.local';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { dsr_id } = await req.json();

    const { data: dsr } = await db
      .from('lgpd_dsr_requests')
      .select('*')
      .eq('id', dsr_id)
      .single();
    if (!dsr) throw new Error('DSR não encontrado');

    const r = dsr as {
      id: string; workspace_id: string;
      subject_id: string | null; subject_email: string | null;
      subject_phone: string | null; subject_doc: string | null;
    };

    await db.from('lgpd_dsr_requests').update({ status: 'processing' }).eq('id', dsr_id);

    const counts = {
      customer_profiles_anonymized: 0,
      customer_facts_deleted: 0,
      conversations_anonymized: 0,
      messages_anonymized: 0,
    };

    const phone = r.subject_phone ?? null;
    const email = r.subject_email ?? null;

    // 1. customer_profiles → anonimiza PII
    const { data: profiles } = await db
      .from('customer_profiles')
      .select('id')
      .eq('workspace_id', r.workspace_id)
      .or(
        [
          phone && `phone.eq.${phone}`,
          email && `email.eq.${email}`,
          r.subject_doc && `document.eq.${r.subject_doc}`,
          r.subject_id && `external_id.eq.${r.subject_id}`,
        ].filter(Boolean).join(',') || 'id.eq.00000000-0000-0000-0000-000000000000',
      );

    const profileIds = (profiles ?? []).map((p: { id: string }) => p.id);

    if (profileIds.length > 0) {
      const { count } = await db
        .from('customer_profiles')
        .update({
          name: ANON_NAME, phone: ANON_PHONE, email: ANON_EMAIL,
          document: null, external_id: null,
          tags: [], score: 0, sentiment_trend: 0,
        })
        .in('id', profileIds)
        .select('id', { count: 'exact', head: true });
      counts.customer_profiles_anonymized = count ?? 0;

      // 2. customer_facts → delete
      const { count: factsCount } = await db
        .from('customer_facts').delete().in('customer_id', profileIds).select('id', { count: 'exact', head: true });
      counts.customer_facts_deleted = factsCount ?? 0;
    }

    // 3. inbox_conversations → anonimiza
    const { data: convs } = await db
      .from('inbox_conversations')
      .select('id')
      .eq('workspace_id', r.workspace_id)
      .or([
        phone && `customer_phone.eq.${phone}`,
        email && `customer_email.eq.${email}`,
      ].filter(Boolean).join(',') || 'id.eq.00000000-0000-0000-0000-000000000000');

    const convIds = (convs ?? []).map((c: { id: string }) => c.id);

    if (convIds.length > 0) {
      const { count } = await db.from('inbox_conversations').update({
        customer_name: ANON_NAME, customer_phone: ANON_PHONE, customer_email: ANON_EMAIL,
        customer_id: null, last_preview: '[mensagens anonimizadas — LGPD]',
        tags: [], metadata: {},
      }).in('id', convIds).select('id', { count: 'exact', head: true });
      counts.conversations_anonymized = count ?? 0;

      // 4. inbox_messages — limpa body
      const { count: msgsCount } = await db
        .from('inbox_messages')
        .update({
          body: '[mensagem anonimizada — LGPD]',
          sender_name: ANON_NAME,
          attachments: [],
          metadata: {},
        })
        .in('conversation_id', convIds)
        .select('id', { count: 'exact', head: true });
      counts.messages_anonymized = msgsCount ?? 0;
    }

    // 5. Marca DSR completed
    await db.from('lgpd_dsr_requests').update({
      status: 'completed',
      response_data: { erased: counts },
      resolved_at: new Date().toISOString(),
      resolution_notes: `Anonimização LGPD Art. 18 V — registros mantidos por dever legal (Art. 16 II)`,
    }).eq('id', dsr_id);

    return new Response(JSON.stringify({ erased: counts }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[lgpd-erase]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
