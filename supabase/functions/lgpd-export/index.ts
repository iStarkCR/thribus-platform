/**
 * Edge Function: lgpd-export
 *
 * LGPD Art. 18 — direito de acesso + portabilidade. Recebe DSR id,
 * coleta TODOS os dados do titular em todas as tabelas, gera JSON
 * estruturado e marca request como completed.
 *
 * Body: { dsr_id: uuid }
 *
 * Resposta: { json } com bundle completo + URL pra download.
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

interface DsrRow {
  id: string; workspace_id: string;
  subject_id: string | null; subject_email: string | null;
  subject_phone: string | null; subject_doc: string | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { dsr_id } = await req.json();

    // 1. Pega DSR
    const { data: dsr, error: dsrErr } = await db
      .from('lgpd_dsr_requests')
      .select('*')
      .eq('id', dsr_id)
      .single();
    if (dsrErr || !dsr) throw new Error('DSR não encontrado');

    const r = dsr as DsrRow;
    await db.from('lgpd_dsr_requests').update({ status: 'processing' }).eq('id', dsr_id);

    // 2. Coleta dados em todas as tabelas relevantes
    const bundle: Record<string, unknown> = {
      generated_at: new Date().toISOString(),
      legal_basis: 'LGPD Art. 18 — direito de acesso',
      subject: {
        id: r.subject_id, email: r.subject_email, phone: r.subject_phone, document: r.subject_doc,
      },
    };

    // 2.1 — customer_profiles
    const { data: profiles } = await db
      .from('customer_profiles')
      .select('*')
      .eq('workspace_id', r.workspace_id)
      .or(buildOrFilter(r));
    bundle.customer_profiles = profiles ?? [];

    // 2.2 — customer_facts (memorização)
    const profileIds = (profiles ?? []).map((p: { id: string }) => p.id);
    if (profileIds.length > 0) {
      const { data: facts } = await db
        .from('customer_facts')
        .select('*')
        .in('customer_id', profileIds);
      bundle.customer_facts = facts ?? [];
    }

    // 2.3 — inbox_conversations + inbox_messages
    const phoneOrEmail = r.subject_phone ?? r.subject_email ?? '';
    const { data: convs } = await db
      .from('inbox_conversations')
      .select('*')
      .eq('workspace_id', r.workspace_id)
      .or(`customer_phone.eq.${phoneOrEmail},customer_email.eq.${phoneOrEmail}`);
    bundle.conversations = convs ?? [];

    const convIds = (convs ?? []).map((c: { id: string }) => c.id);
    if (convIds.length > 0) {
      const { data: msgs } = await db
        .from('inbox_messages')
        .select('*')
        .in('conversation_id', convIds);
      bundle.messages = msgs ?? [];
    }

    // 2.4 — consent log
    const { data: consents } = await db
      .from('lgpd_consent_log')
      .select('*')
      .eq('workspace_id', r.workspace_id)
      .or(`subject_phone.eq.${phoneOrEmail},subject_email.eq.${phoneOrEmail}`);
    bundle.consent_log = consents ?? [];

    // 2.5 — PII detections relacionadas
    if (convIds.length > 0) {
      const { data: pii } = await db
        .from('lgpd_pii_detections')
        .select('*')
        .in('conversation_id', convIds);
      bundle.pii_detections = pii ?? [];
    }

    // 3. Marca completed
    await db.from('lgpd_dsr_requests').update({
      status: 'completed',
      response_data: bundle,
      resolved_at: new Date().toISOString(),
    }).eq('id', dsr_id);

    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="lgpd-export-${dsr_id}.json"`,
      },
    });
  } catch (err) {
    console.error('[lgpd-export]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

function buildOrFilter(r: DsrRow): string {
  const clauses: string[] = [];
  if (r.subject_id) clauses.push(`external_id.eq.${r.subject_id}`);
  if (r.subject_email) clauses.push(`email.eq.${r.subject_email}`);
  if (r.subject_phone) clauses.push(`phone.eq.${r.subject_phone}`);
  if (r.subject_doc) clauses.push(`document.eq.${r.subject_doc}`);
  return clauses.join(',') || 'id.eq.00000000-0000-0000-0000-000000000000';
}
