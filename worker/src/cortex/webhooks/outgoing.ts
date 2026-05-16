/**
 * Cortex M1 — Outgoing Webhooks.
 *
 * Tenant registra URL + secret + lista de eventos. Quando evento dispara,
 * fazemos POST com HMAC-SHA256 signature (header X-Cortex-Signature).
 *
 * Eventos:
 *   - analyze.done            (POST /cortex/analyze concluiu)
 *   - contract.created/signed
 *   - proposal.sent/accepted/rejected
 *   - approval.requested/decided
 *   - workflow.completed/failed
 *
 * Cliente valida com:
 *   crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
 *
 * Retry: até 5 tentativas com backoff exponencial.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger('cortex.webhooks');

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 5;

export interface OutgoingEvent {
  type: string;
  tenantId: string;
  data: Record<string, unknown>;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function emit(event: OutgoingEvent): Promise<void> {
  if (!supabase) return;

  try {
    const { data: webhooks } = await supabase
      .from('cortex_outgoing_webhooks')
      .select('id, url, secret, events')
      .eq('tenant_id', event.tenantId)
      .eq('enabled', true);

    if (!webhooks || webhooks.length === 0) return;

    const matched = webhooks.filter((w) => {
      const events = w.events as string[];
      return events.includes('*') || events.includes(event.type);
    });

    for (const wh of matched) {
      await scheduleDelivery(wh as { id: string; url: string; secret: string }, event);
    }
  } catch (err) {
    logger.warn('emit failed', { type: event.type, error: (err as Error).message });
  }
}

async function scheduleDelivery(
  wh: { id: string; url: string; secret: string },
  event: OutgoingEvent,
): Promise<void> {
  if (!supabase) return;

  const payload = JSON.stringify({
    id: randomBytes(8).toString('hex'),
    type: event.type,
    tenant_id: event.tenantId,
    data: event.data,
    ts: new Date().toISOString(),
  });

  const { data: delivery } = await supabase
    .from('cortex_webhook_deliveries')
    .insert({
      webhook_id: wh.id,
      tenant_id: event.tenantId,
      event_type: event.type,
      payload: JSON.parse(payload),
      status: 'pending',
      attempts: 0,
    })
    .select('id')
    .maybeSingle();

  if (!delivery) return;

  void deliver(delivery.id as number, wh, payload, 1).catch((err) =>
    logger.error('deliver failed', { id: delivery.id, error: (err as Error).message }),
  );
}

async function deliver(
  deliveryId: number,
  wh: { id: string; url: string; secret: string },
  payload: string,
  attempt: number,
): Promise<void> {
  if (!supabase) return;

  const signature = sign(payload, wh.secret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  let success = false;
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const resp = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cortex-Signature': signature,
        'X-Cortex-Delivery-Id': String(deliveryId),
        'X-Cortex-Attempt': String(attempt),
      },
      body: payload,
      signal: controller.signal,
    });
    httpStatus = resp.status;
    responseBody = await resp.text().then((s) => s.slice(0, 500));
    success = resp.status >= 200 && resp.status < 300;
  } catch (err) {
    error = (err as Error).message;
  } finally {
    clearTimeout(timeout);
  }

  if (success) {
    await supabase
      .from('cortex_webhook_deliveries')
      .update({
        status: 'success',
        http_status: httpStatus,
        response_body: responseBody,
        attempts: attempt,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);
    await supabase
      .from('cortex_outgoing_webhooks')
      .update({
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
      })
      .eq('id', wh.id);
    return;
  }

  // Falha
  if (attempt < MAX_ATTEMPTS) {
    const backoffSec = Math.pow(2, attempt) * 30; // 60s, 120s, 240s, 480s, 960s
    const nextRetry = new Date(Date.now() + backoffSec * 1000);
    await supabase
      .from('cortex_webhook_deliveries')
      .update({
        status: 'retry',
        http_status: httpStatus,
        response_body: responseBody ?? error,
        attempts: attempt,
        next_retry_at: nextRetry.toISOString(),
      })
      .eq('id', deliveryId);
    // Agenda retry async (em produção: usar cron pra ler `cortex_webhook_deliveries` com status=retry)
    setTimeout(() => {
      void deliver(deliveryId, wh, payload, attempt + 1);
    }, backoffSec * 1000).unref?.();
  } else {
    await supabase
      .from('cortex_webhook_deliveries')
      .update({
        status: 'failed',
        http_status: httpStatus,
        response_body: responseBody ?? error,
        attempts: attempt,
      })
      .eq('id', deliveryId);
    await supabase
      .from('cortex_outgoing_webhooks')
      .update({
        last_failure_at: new Date().toISOString(),
        consecutive_failures: attempt,
      })
      .eq('id', wh.id);
    logger.warn('webhook delivery exhausted', { deliveryId, webhookId: wh.id });
  }
}

export function generateWebhookSecret(): string {
  return `whsk_${randomBytes(32).toString('hex')}`;
}
