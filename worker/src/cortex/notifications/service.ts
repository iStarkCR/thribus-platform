/**
 * Cortex M1 — Notification Service.
 *
 * Envia notificações multicanal: email (Resend/SES), Slack (incoming webhook),
 * WhatsApp (via TexNet), in-app (DB).
 *
 * Uso interno (a partir de workflows, approvals, agentes):
 *   await notify(tenantId, { channel: 'email', destination: 'a@b.com', title, body })
 *   await notify(tenantId, { channel: 'in_app', user_id, title, body })
 *
 * Degrada graceful — se canal não configurado, marca como failed mas continua.
 */

import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger('cortex.notifications');

export type NotificationChannel = 'email' | 'slack' | 'in_app' | 'webhook' | 'whatsapp';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationInput {
  tenantId: string;
  userId?: string;
  channel: NotificationChannel;
  destination?: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  category?: string;
  priority?: NotificationPriority;
  source?: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'Cortex Brain <noreply@cortex.thribus.com.br>';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

async function sendEmailViaResend(to: string, title: string, body: string): Promise<void> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: title,
      html: body || title,
    }),
  });
  if (!resp.ok) {
    throw new Error(`resend_${resp.status}: ${await resp.text()}`);
  }
}

/** Webhook genérico — POST JSON na URL de destino. */
async function sendWebhook(url: string, input: NotificationInput): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cortex-Event': 'notification',
    },
    body: JSON.stringify({
      tenant_id: input.tenantId,
      title: input.title,
      body: input.body ?? null,
      category: input.category ?? null,
      priority: input.priority ?? 'normal',
      source: input.source ?? null,
      data: input.data ?? {},
      sent_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`webhook_${resp.status}`);
}

/** WhatsApp via Evolution API — destination é o número E.164 (553299...). */
async function sendWhatsApp(number: string, title: string, body?: string): Promise<void> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    throw new Error('EVOLUTION_API_URL/EVOLUTION_API_KEY/EVOLUTION_INSTANCE not configured');
  }
  const text = body ? `*${title}*\n\n${body}` : title;
  const resp = await fetch(
    `${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: number.replace(/\D/g, ''), text }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!resp.ok) {
    throw new Error(`evolution_${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  }
}

async function sendSlack(webhookUrl: string, title: string, body?: string): Promise<void> {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: title,
      blocks: body
        ? [
            { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
            { type: 'section', text: { type: 'mrkdwn', text: body } },
          ]
        : undefined,
    }),
  });
  if (!resp.ok) throw new Error(`slack_${resp.status}`);
}

export async function notify(input: NotificationInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!supabase) return { ok: false, error: 'supabase not configured' };

  const { data, error } = await supabase
    .from('cortex_notifications')
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId ?? null,
      channel: input.channel,
      destination: input.destination ?? null,
      title: input.title.slice(0, 200),
      body: input.body ?? null,
      data: input.data ?? {},
      category: input.category ?? null,
      priority: input.priority ?? 'normal',
      source: input.source ?? null,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    logger.warn('notify insert failed', { error: error?.message });
    return { ok: false, error: error?.message };
  }

  // Dispatch async — não bloqueia caller
  void dispatch(data.id as number, input).catch((err) =>
    logger.error('dispatch failed', { id: data.id, error: (err as Error).message }),
  );

  return { ok: true, id: data.id as number };
}

async function dispatch(id: number, input: NotificationInput): Promise<void> {
  if (!supabase) return;

  let status: 'sent' | 'failed' = 'sent';
  let errorMsg: string | null = null;

  try {
    switch (input.channel) {
      case 'email':
        if (!input.destination) throw new Error('destination required for email');
        await sendEmailViaResend(input.destination, input.title, input.body ?? '');
        break;
      case 'slack':
        if (!input.destination) throw new Error('destination (slack webhook url) required');
        await sendSlack(input.destination, input.title, input.body);
        break;
      case 'in_app':
        // Já está no DB — apenas marca sent
        break;
      case 'webhook':
        if (!input.destination) throw new Error('destination (url) required for webhook');
        await sendWebhook(input.destination, input);
        break;
      case 'whatsapp':
        if (!input.destination) throw new Error('destination (phone) required for whatsapp');
        await sendWhatsApp(input.destination, input.title, input.body);
        break;
      default:
        throw new Error(`unknown channel: ${input.channel}`);
    }
  } catch (err) {
    status = 'failed';
    errorMsg = (err as Error).message;
    logger.warn('dispatch error', { id, channel: input.channel, error: errorMsg });
  }

  await supabase
    .from('cortex_notifications')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error: errorMsg,
    })
    .eq('id', id);
}

/** Lista in-app notifications do user logado. */
export async function listInApp(userId: string, limit = 50): Promise<unknown[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('cortex_notifications')
    .select('id, title, body, category, priority, status, read_at, created_at, data')
    .eq('user_id', userId)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function markRead(notificationId: number, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('cortex_notifications')
    .update({ read_at: new Date().toISOString(), status: 'read' })
    .eq('id', notificationId)
    .eq('user_id', userId);
  return !error;
}
