/**
 * Customers service — Customer 360 (perfil persistente + fatos + contratos).
 *
 * 2 fontes:
 *   1. `customer_profiles` no Supabase — perfil consolidado (sync IXC + memorização)
 *   2. `ixc-proxy` edge function — buscar cliente real no IXC ao vivo
 *
 * UI tenta primeiro Supabase (rápido + offline-friendly), fallback pro IXC ao vivo.
 */

import { supabase } from '@/lib/supabase';
import type { CustomerProfile, LeadFact, LeadInteraction, LeadContract } from '@/lib/seed-customer360';

export const customersConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface ProfileRow {
  id: string; workspace_id: string; external_id: string | null;
  name: string; phone: string | null; email: string | null;
  document: string | null; city: string | null; state: string | null;
  stage: CustomerProfile['stage']; temperature: CustomerProfile['temperature'];
  score: number; ltv: number; total_spent: number; sentiment_trend: number;
  tags: string[]; owner_agent_id: string | null;
  first_seen_at: string; last_seen_at: string;
}

function rowToProfile(r: ProfileRow): CustomerProfile {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name,
    phone: r.phone ?? '', email: r.email ?? undefined, document: r.document ?? undefined,
    city: [r.city, r.state].filter(Boolean).join('/'),
    stage: r.stage, temperature: r.temperature, score: r.score,
    ltv: Number(r.ltv), totalSpent: Number(r.total_spent),
    sentimentTrend: Number(r.sentiment_trend),
    tags: r.tags ?? [],
    firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at,
    ownerAgentId: r.owner_agent_id ?? undefined,
  };
}

export async function listCustomers(workspaceId: string, limit = 100): Promise<CustomerProfile[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToProfile(r as ProfileRow));
}

export async function getCustomerFacts(customerId: string): Promise<LeadFact[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('customer_facts')
    .select('*')
    .eq('customer_id', customerId)
    .order('captured_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    leadId: r.customer_id as string,
    source: r.source as LeadFact['source'],
    category: r.category as LeadFact['category'],
    fact: r.fact as string,
    confidence: Number(r.confidence),
    capturedBy: (r.captured_by as string) ?? 'Sistema',
    capturedAt: r.captured_at as string,
  }));
}

export async function getCustomerInteractions(customerId: string): Promise<LeadInteraction[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('customer_interactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    leadId: r.customer_id as string,
    channel: r.channel as LeadInteraction['channel'],
    agentName: (r.agent_name as string) ?? undefined,
    summary: r.summary as string,
    sentiment: Number(r.sentiment),
    timestamp: r.created_at as string,
  }));
}

export async function getCustomerContracts(customerId: string): Promise<LeadContract[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('customer_contracts')
    .select('*')
    .eq('customer_id', customerId);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    leadId: r.customer_id as string,
    product: r.product as string,
    status: r.status as LeadContract['status'],
    mrr: Number(r.mrr),
    startedAt: r.started_at as string,
    endsAt: (r.ends_at as string) ?? undefined,
  }));
}

// ─── IXC ao vivo (via edge function) ────────────────────────────────────────
export interface IxcClientLive {
  id: string; name: string; document: string;
  phone?: string; email?: string; city?: string; state?: string; active: boolean;
}

export async function searchIxcByPhone(phone: string): Promise<IxcClientLive[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('ixc-proxy', {
    body: { action: 'cliente.list', params: { phone: phone.replace(/\D/g, '') } },
  });
  if (error) throw error;
  return data as IxcClientLive[];
}
