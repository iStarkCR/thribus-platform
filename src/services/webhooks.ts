/**
 * Webhooks outbound — gerenciamento de endpoints + visualização de deliveries.
 */

import { supabase } from '@/lib/supabase';
import type { OutboundWebhook, WebhookDelivery, WebhookEvent } from '@/lib/seed-final';

export const webhooksConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface WebhookRow {
  id: string; workspace_id: string; label: string; url: string;
  events: WebhookEvent[]; secret: string; active: boolean;
  success_count: number; failure_count: number;
  last_triggered_at: string | null; created_at: string;
}

interface DeliveryRow {
  id: string; webhook_id: string; event: WebhookEvent;
  url: string; status: WebhookDelivery['status']; http_code: number | null;
  attempt_count: number; latency_ms: number; created_at: string;
}

function rowToWebhook(r: WebhookRow): OutboundWebhook {
  const total = r.success_count + r.failure_count;
  return {
    id: r.id, label: r.label, url: r.url, events: r.events,
    active: r.active, deliveries30d: total,
    successRate: total > 0 ? r.success_count / total : 0,
    lastTriggeredAt: r.last_triggered_at ?? undefined,
    secret: maskSecret(r.secret),
  };
}

function maskSecret(s: string): string {
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 6) + '•••••' + s.slice(-3);
}

function rowToDelivery(r: DeliveryRow): WebhookDelivery {
  return {
    id: r.id, webhookId: r.webhook_id, event: r.event, url: r.url,
    status: r.status, httpCode: r.http_code ?? 0,
    attemptCount: r.attempt_count, latencyMs: r.latency_ms,
    timestamp: r.created_at,
  };
}

export async function listWebhooks(workspaceId: string): Promise<OutboundWebhook[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('outbound_webhooks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToWebhook(r as WebhookRow));
}

export async function listDeliveries(workspaceId: string, limit = 50): Promise<WebhookDelivery[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToDelivery(r as DeliveryRow));
}

export async function toggleWebhook(id: string, active: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('outbound_webhooks').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function createWebhook(params: {
  workspaceId: string; label: string; url: string; events: WebhookEvent[];
}): Promise<OutboundWebhook> {
  if (!supabase) throw new Error('Supabase não configurado');
  const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`;
  const { data, error } = await supabase
    .from('outbound_webhooks')
    .insert({
      workspace_id: params.workspaceId,
      label: params.label, url: params.url, events: params.events, secret,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToWebhook(data as WebhookRow);
}

export async function deleteWebhook(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('outbound_webhooks').delete().eq('id', id);
  if (error) throw error;
}
