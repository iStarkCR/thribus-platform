/**
 * Edge Function: reports-generate
 *
 * Roda em cron — pega report_schedules com next_run_at <= now() e gera
 * report_run pra cada um (KPIs + highlights + alertas). Manda por email/slack.
 *
 * Body opcional: { schedule_id } — força rodar um schedule específico (preview).
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

interface ScheduleRow {
  id: string; workspace_id: string; name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  channels: string[]; recipients: string[]; sections: string[];
  next_run_at: string;
}

serve(async (req: Request) => {
  let body: { schedule_id?: string } = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /* empty */ }
  }

  // 1. Schedules a processar
  let query = db
    .from('report_schedules')
    .select('*')
    .eq('enabled', true);

  if (body.schedule_id) {
    query = query.eq('id', body.schedule_id);
  } else {
    query = query.lte('next_run_at', new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const schedules = (data ?? []) as ScheduleRow[];
  let generated = 0;

  for (const s of schedules) {
    const since = computeSince(s.frequency);
    const { data: execs } = await db
      .from('executions')
      .select('status, cost, tokens_used')
      .eq('workspace_id', s.workspace_id)
      .gte('created_at', since);

    const list = execs ?? [];
    const totalCost = list.reduce((acc: number, e: { cost: number | null }) => acc + (e.cost ?? 0), 0);
    const totalTokens = list.reduce((acc: number, e: { tokens_used: number | null }) => acc + (e.tokens_used ?? 0), 0);
    const escalated = list.filter((e: { status: string }) => e.status === 'escalated').length;
    const resolved = list.filter((e: { status: string }) => e.status === 'resolved').length;
    const resolutionRate = list.length > 0 ? (resolved / list.length) : 0;

    const kpis = [
      { label: 'Conversas', value: list.length.toString(), trend: 0 },
      { label: 'Resolução automática', value: `${(resolutionRate * 100).toFixed(1)}%`, trend: 0 },
      { label: 'Custo total', value: `US$ ${totalCost.toFixed(2)}`, trend: 0 },
      { label: 'Tokens', value: `${(totalTokens / 1000).toFixed(0)}k`, trend: 0 },
    ];

    const highlights: string[] = [
      `${list.length} conversas no período`,
      `${resolved} resolvidas automaticamente (${(resolutionRate * 100).toFixed(0)}%)`,
      `Custo total US$ ${totalCost.toFixed(2)}`,
    ];

    const alerts: string[] = [];
    if (escalated > 0) alerts.push(`${escalated} escalações precisaram de humano`);
    if (resolutionRate < 0.8 && list.length > 10) alerts.push(`Resolução abaixo do alvo (80%)`);

    await db.from('report_runs').insert({
      schedule_id: s.id,
      workspace_id: s.workspace_id,
      status: 'sent',
      recipients_count: s.recipients.length,
      highlights, kpis, alerts,
    });

    // Atualiza next_run_at
    await db.from('report_schedules').update({
      last_sent_at: new Date().toISOString(),
      next_run_at: computeNextRun(s.frequency),
    }).eq('id', s.id);

    // TODO: enviar via email/slack/whatsapp — só log por enquanto
    console.log(`[reports] Generated for ${s.workspace_id} (${s.name})`);

    generated++;
  }

  return new Response(JSON.stringify({ schedules: schedules.length, generated }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});

function computeSince(freq: string): string {
  const days = freq === 'daily' ? 1 : freq === 'weekly' ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function computeNextRun(freq: string): string {
  const days = freq === 'daily' ? 1 : freq === 'weekly' ? 7 : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
