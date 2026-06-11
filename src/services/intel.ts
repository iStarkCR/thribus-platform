/**
 * Intel — sandbox/trials, insights/VoC, reports, partners.
 * Agrupado em 1 service pra reduzir overhead — features de read-mostly.
 */
import { supabase } from '@/lib/supabase';

export const intelConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

// ─── Sandbox / Trials ───────────────────────────────────────────────────────
export interface Trial {
  id: string; companyName: string; industry: string; ownerEmail: string;
  syntheticDataLoaded: boolean; conversationsTested: number;
  agentsCreated: number; convertedToPaid: boolean;
  expiresAt: string; daysLeft: number;
}

export async function listTrials(workspaceId: string): Promise<Trial[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('sandbox_trials')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, companyName: r.company_name as string,
    industry: r.industry as string, ownerEmail: r.owner_email as string,
    syntheticDataLoaded: r.synthetic_data_loaded as boolean,
    conversationsTested: r.conversations_tested as number,
    agentsCreated: r.agents_created as number,
    convertedToPaid: r.converted_to_paid as boolean,
    expiresAt: r.expires_at as string,
    daysLeft: Math.max(0, Math.ceil((new Date(r.expires_at as string).getTime() - Date.now()) / 86_400_000)),
  }));
}

export async function convertTrial(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('sandbox_trials')
    .update({ converted_to_paid: true, converted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Daily Insights ─────────────────────────────────────────────────────────
export interface DailyInsight {
  id: string; insightDate: string; kind: string;
  title: string; body: string; severity: 'info' | 'warning' | 'critical';
  metricValue?: number; referenceUrl?: string;
}

export async function listDailyInsights(workspaceId: string, days = 30): Promise<DailyInsight[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const since = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('insight_date', since)
    .order('insight_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, insightDate: r.insight_date as string,
    kind: r.kind as string, title: r.title as string, body: r.body as string,
    severity: r.severity as DailyInsight['severity'],
    metricValue: r.metric_value === null ? undefined : Number(r.metric_value),
    referenceUrl: (r.reference_url as string) ?? undefined,
  }));
}

// ─── VoC Themes ─────────────────────────────────────────────────────────────
export interface VocTheme {
  id: string; theme: string; category: string;
  mentions: number; sentimentAvg?: number; sampleQuote?: string;
  trend7d?: number; lastSeenAt: string;
}

export async function listVocThemes(workspaceId: string): Promise<VocTheme[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('voc_themes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('mentions', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, theme: r.theme as string,
    category: r.category as string, mentions: r.mentions as number,
    sentimentAvg: r.sentiment_avg === null ? undefined : Number(r.sentiment_avg),
    sampleQuote: (r.sample_quote as string) ?? undefined,
    trend7d: r.trend_7d === null ? undefined : Number(r.trend_7d),
    lastSeenAt: r.last_seen_at as string,
  }));
}

// ─── Reports ────────────────────────────────────────────────────────────────
export interface ReportSchedule {
  id: string; name: string; frequency: 'daily' | 'weekly' | 'monthly';
  channels: string[]; recipients: string[]; sections: string[];
  enabled: boolean; nextRunAt: string; lastSentAt?: string;
}

export async function listReportSchedules(workspaceId: string): Promise<ReportSchedule[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('next_run_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string,
    frequency: r.frequency as ReportSchedule['frequency'],
    channels: r.channels as string[], recipients: r.recipients as string[],
    sections: r.sections as string[], enabled: r.enabled as boolean,
    nextRunAt: r.next_run_at as string,
    lastSentAt: (r.last_sent_at as string) ?? undefined,
  }));
}

export async function toggleReportSchedule(id: string, enabled: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  await supabase.from('report_schedules').update({ enabled }).eq('id', id);
}

export async function generateReportNow(scheduleId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.functions.invoke('reports-generate', {
    body: { schedule_id: scheduleId },
  });
  if (error) throw error;
}

// ─── Partners ───────────────────────────────────────────────────────────────
export interface PartnerAccount {
  id: string; name: string; email: string;
  tier: 'silver' | 'gold' | 'platinum';
  commissionRate: number; referralCode: string;
  leadsCount: number; conversions: number;
  totalRevenueBrl: number; totalCommissionBrl: number;
  createdAt: string;
}

export async function listPartners(workspaceId: string): Promise<PartnerAccount[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('partner_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('total_revenue_brl', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string, email: r.email as string,
    tier: r.tier as PartnerAccount['tier'],
    commissionRate: Number(r.commission_rate),
    referralCode: r.referral_code as string,
    leadsCount: r.leads_count as number, conversions: r.conversions as number,
    totalRevenueBrl: Number(r.total_revenue_brl),
    totalCommissionBrl: Number(r.total_commission_brl),
    createdAt: r.created_at as string,
  }));
}

export interface PartnerLeadRow {
  id: string; partnerId: string; partnerName: string;
  leadName: string;
  status: 'new' | 'qualified' | 'demo' | 'proposal' | 'won' | 'lost';
  estimatedMrr: number; createdAt: string;
}

const LEAD_STATUS_MAP: Record<string, PartnerLeadRow['status']> = {
  novo: 'new', contato: 'qualified', demo: 'demo',
  negociacao: 'proposal', convertido: 'won', perdido: 'lost',
};

export async function listPartnerLeads(workspaceId: string, limit = 30): Promise<PartnerLeadRow[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('partner_leads')
    .select('id, partner_id, lead_email, lead_company, status, deal_value_brl, created_at, partner_accounts(name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const partner = r.partner_accounts as { name: string } | { name: string }[] | null;
    const partnerName = Array.isArray(partner) ? (partner[0]?.name ?? '') : (partner?.name ?? '');
    return {
      id: r.id as string, partnerId: r.partner_id as string, partnerName,
      leadName: (r.lead_company as string) || (r.lead_email as string),
      status: LEAD_STATUS_MAP[r.status as string] ?? 'new',
      estimatedMrr: r.deal_value_brl === null ? 0 : Number(r.deal_value_brl),
      createdAt: r.created_at as string,
    };
  });
}
