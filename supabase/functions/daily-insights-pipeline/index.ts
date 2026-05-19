/**
 * Edge Function: daily-insights-pipeline
 *
 * Roda em cron (1x/dia 6am) — analisa executions+inbox_messages das últimas
 * 24h e produz daily_insights + voc_themes para cada workspace.
 *
 * Usa OpenAI pra agrupamento temático leve (gpt-4o-mini).
 *
 * Schedule via pg_cron:
 *   select cron.schedule('daily-insights', '0 9 * * *',
 *     $$ select net.http_post(
 *       url := 'https://<proj>.supabase.co/functions/v1/daily-insights-pipeline',
 *       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
 *     ) $$);
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// @ts-expect-error
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

interface WorkspaceStats {
  workspace_id: string;
  total_executions: number;
  escalations: number;
  avg_cost: number;
  cost_anomaly_pct: number | null;
}

serve(async () => {
  const t0 = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // 1. Workspaces ativos
  const { data: workspaces } = await db.from('workspaces').select('id');
  const wsIds = (workspaces ?? []).map((w: { id: string }) => w.id);

  let totalInsights = 0;

  for (const wsId of wsIds) {
    // 2. Stats últimas 24h
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: execs } = await db
      .from('executions')
      .select('cost, status, customer_name')
      .eq('workspace_id', wsId)
      .gte('created_at', since);

    const list = execs ?? [];
    if (list.length === 0) continue;

    const escalations = list.filter((e: { status: string }) => e.status === 'escalated').length;
    const avg = list.reduce((s: number, e: { cost: number | null }) => s + (e.cost ?? 0), 0) / list.length;

    // 3. Compara com semana anterior pra detectar anomalia de custo
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: prevExecs } = await db
      .from('executions')
      .select('cost')
      .eq('workspace_id', wsId)
      .gte('created_at', weekAgo)
      .lt('created_at', since);

    const prevAvg = prevExecs && prevExecs.length > 0
      ? prevExecs.reduce((s: number, e: { cost: number | null }) => s + (e.cost ?? 0), 0) / prevExecs.length
      : 0;
    const anomalyPct = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : null;

    // 4. Inserts
    const insights: Array<Record<string, unknown>> = [];

    if (escalations > 0) {
      insights.push({
        workspace_id: wsId,
        insight_date: today,
        kind: 'agent_alert',
        title: `${escalations} escalações nas últimas 24h`,
        body: `Avaliar prompts dos agentes que mais escalaram. Hot fix: revisar template de objeção.`,
        severity: escalations > 10 ? 'critical' : escalations > 3 ? 'warning' : 'info',
        metric_value: escalations,
      });
    }

    if (anomalyPct !== null && Math.abs(anomalyPct) > 30) {
      insights.push({
        workspace_id: wsId,
        insight_date: today,
        kind: 'cost_anomaly',
        title: `Custo ${anomalyPct > 0 ? 'subiu' : 'caiu'} ${Math.abs(anomalyPct).toFixed(0)}% vs. semana anterior`,
        body: `Custo médio por execução: US$ ${avg.toFixed(4)} (vs. US$ ${prevAvg.toFixed(4)}). Rodar AI Cost Optimizer.`,
        severity: Math.abs(anomalyPct) > 50 ? 'warning' : 'info',
        metric_value: anomalyPct,
        reference_url: '/optimizer',
      });
    }

    if (insights.length > 0) {
      await db.from('daily_insights').insert(insights);
      totalInsights += insights.length;
    }

    // 5. VoC themes — opcional, usa OpenAI se OPENAI_KEY disponível
    if (OPENAI_KEY && list.length >= 10) {
      try {
        await analyzeVocThemes(wsId);
      } catch (e) {
        console.warn(`[insights] VoC ${wsId} falhou:`, e);
      }
    }
  }

  return new Response(JSON.stringify({
    workspaces: wsIds.length, insights_inserted: totalInsights,
    duration_ms: Date.now() - t0,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

async function analyzeVocThemes(workspaceId: string) {
  // Pega últimas 50 msgs in (incoming) do dia
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: msgs } = await db
    .from('inbox_messages')
    .select('body')
    .eq('workspace_id', workspaceId)
    .eq('direction', 'in')
    .gte('created_at', since)
    .limit(50);

  const sample = (msgs ?? [])
    .map((m: { body: string | null }) => m.body)
    .filter(Boolean)
    .slice(0, 30)
    .join('\n---\n');

  if (!sample) return;

  const prompt = `Analise estas mensagens de clientes e identifique até 5 TEMAS recorrentes.
Para cada tema retorne JSON: { theme, category (pain/wish/praise/question/complaint), mentions, sample_quote }.
Apenas JSON puro, array.

MENSAGENS:
${sample}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!res.ok) return;
  const json = await res.json() as { choices: { message: { content: string } }[] };
  let parsed: Array<Record<string, unknown>> = [];
  try {
    const c = JSON.parse(json.choices[0].message.content);
    parsed = Array.isArray(c) ? c : (c.themes ?? c.results ?? []);
  } catch { return; }

  for (const t of parsed.slice(0, 5)) {
    await db.from('voc_themes').upsert({
      workspace_id: workspaceId,
      theme: String(t.theme ?? '').slice(0, 200),
      category: ['pain', 'wish', 'praise', 'question', 'complaint'].includes(String(t.category))
        ? t.category : 'question',
      mentions: Number(t.mentions ?? 1),
      sample_quote: String(t.sample_quote ?? '').slice(0, 500),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,theme' });
  }
}
