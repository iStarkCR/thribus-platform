/**
 * Edge Function: webhook-dispatch
 *
 * Processa fila webhook_deliveries — pega rows pending/retrying com
 * next_attempt_at <= now(), faz POST com HMAC signing, marca success/failed
 * + retry exponencial (1m, 5m, 30m, 4h, 24h).
 *
 * Rodar via cron (Supabase Scheduled Functions) ou pg_cron a cada 1min:
 *
 *   -- pg_cron:
 *   select cron.schedule('webhook-dispatch', '* * * * *',
 *     $$ select net.http_post(
 *       url := 'https://<proj>.supabase.co/functions/v1/webhook-dispatch',
 *       headers := '{"Authorization": "Bearer <service_role>"}'::jsonb
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

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const BACKOFF_MINUTES = [1, 5, 30, 240, 1440];        // 1m, 5m, 30m, 4h, 24h
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

interface DeliveryRow {
  id: string; webhook_id: string; workspace_id: string;
  event: string; url: string; payload: Record<string, unknown>;
  attempt_count: number;
}

interface WebhookRow {
  id: string; secret: string;
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async () => {
  const startedAt = Date.now();

  // Pega até 50 deliveries pendentes/retrying com next_attempt_at <= agora
  const { data: deliveries, error: qErr } = await db
    .from('webhook_deliveries')
    .select('id, webhook_id, workspace_id, event, url, payload, attempt_count')
    .in('status', ['pending', 'retrying'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(50);

  if (qErr) {
    console.error('[webhook-dispatch] query error', qErr);
    return new Response(JSON.stringify({ error: qErr.message }), { status: 500 });
  }

  const items = (deliveries ?? []) as DeliveryRow[];
  let processed = 0, succeeded = 0, failed = 0;

  for (const d of items) {
    // Busca webhook pro secret HMAC
    const { data: wh } = await db
      .from('outbound_webhooks')
      .select('id, secret')
      .eq('id', d.webhook_id)
      .single();

    if (!wh) continue;
    const webhook = wh as WebhookRow;

    const body = JSON.stringify(d.payload);
    const signature = await hmacSign(webhook.secret, body);
    const attempt = d.attempt_count + 1;
    const t0 = Date.now();

    try {
      const res = await fetch(d.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Thribus-Event': d.event,
          'X-Thribus-Signature': `sha256=${signature}`,
          'X-Thribus-Delivery': d.id,
          'X-Thribus-Attempt': attempt.toString(),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const latency = Date.now() - t0;
      const ok = res.status >= 200 && res.status < 300;

      if (ok) {
        await db.from('webhook_deliveries').update({
          status: 'success', http_code: res.status, attempt_count: attempt,
          latency_ms: latency, delivered_at: new Date().toISOString(),
        }).eq('id', d.id);
        await db.rpc('exec_sql', {}).catch(() => {}); // no-op
        await db.from('outbound_webhooks').update({
          success_count: undefined,
          last_triggered_at: new Date().toISOString(),
        }).eq('id', webhook.id);
        succeeded++;
      } else {
        await markFailedOrRetry(d.id, attempt, latency, res.status, `HTTP ${res.status}`);
        failed++;
      }
    } catch (e) {
      const latency = Date.now() - t0;
      await markFailedOrRetry(d.id, attempt, latency, 0, (e as Error).message);
      failed++;
    }
    processed++;
  }

  return new Response(JSON.stringify({
    processed, succeeded, failed,
    duration_ms: Date.now() - startedAt,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

async function markFailedOrRetry(deliveryId: string, attempt: number, latency: number, httpCode: number, errorMsg: string) {
  if (attempt >= MAX_ATTEMPTS) {
    await db.from('webhook_deliveries').update({
      status: 'failed', http_code: httpCode, attempt_count: attempt,
      latency_ms: latency, error: errorMsg, delivered_at: new Date().toISOString(),
    }).eq('id', deliveryId);
  } else {
    const backoffMin = BACKOFF_MINUTES[attempt - 1] ?? 1440;
    const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();
    await db.from('webhook_deliveries').update({
      status: 'retrying', http_code: httpCode, attempt_count: attempt,
      latency_ms: latency, error: errorMsg, next_attempt_at: nextAt,
    }).eq('id', deliveryId);
  }
}
