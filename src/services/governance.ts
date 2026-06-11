/**
 * Governança — membros (RBAC), audit log, retenção, SLA e white-label.
 *
 * Roles/permissions são definição de produto e vivem no código (seed-governance);
 * o que é dado de cliente (membros, audit, políticas) vem do Supabase.
 */

import { supabase } from '@/lib/supabase';
import type {
  Member, AuditEntry, AuditAction, RetentionPolicy, SLATarget, BrandingConfig,
} from '@/lib/seed-governance';

export const governanceConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface MemberRow {
  id: string; workspace_id: string; name: string; email: string;
  role: Member['role']; status: Member['status'];
  two_factor_enabled: boolean; last_seen_at: string | null;
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, name, email, role, status, two_factor_enabled, last_seen_at')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as MemberRow;
    return {
      id: row.id, name: row.name, email: row.email, role: row.role,
      workspaceIds: [row.workspace_id],
      lastSeenAt: row.last_seen_at ?? new Date(0).toISOString(),
      twoFactorEnabled: row.two_factor_enabled,
      status: row.status,
    };
  });
}

interface AuditRow {
  id: string; workspace_id: string; actor_name: string; actor_email: string;
  action: AuditAction; resource: string; resource_id: string;
  ip: string; user_agent: string; diff: string | null; created_at: string;
}

export async function listAudit(workspaceId: string, limit = 100): Promise<AuditEntry[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, workspace_id, actor_name, actor_email, action, resource, resource_id, ip, user_agent, diff, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as AuditRow;
    return {
      id: row.id, actorName: row.actor_name, actorEmail: row.actor_email,
      action: row.action, resource: row.resource, resourceId: row.resource_id,
      workspaceId: row.workspace_id, ip: row.ip, userAgent: row.user_agent,
      diff: row.diff ?? undefined, timestamp: row.created_at,
    };
  });
}

interface RetentionRow {
  id: string; workspace_id: string;
  conversations_days: number; executions_days: number; audit_log_days: number;
  knowledge_chunks_days: number | null;
  region: RetentionPolicy['region']; data_residency_locked: boolean;
}

export async function listRetention(): Promise<RetentionPolicy[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('retention_policies')
    .select('id, workspace_id, conversations_days, executions_days, audit_log_days, knowledge_chunks_days, region, data_residency_locked')
    .order('workspace_id');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as RetentionRow;
    return {
      id: row.id, workspaceId: row.workspace_id,
      conversationsDays: row.conversations_days,
      executionsDays: row.executions_days,
      auditLogDays: row.audit_log_days,
      knowledgeChunksDays: row.knowledge_chunks_days,
      region: row.region, dataResidencyLocked: row.data_residency_locked,
    };
  });
}

interface SlaRow {
  id: string; workspace_id: string; name: string;
  metric: SLATarget['metric']; target: number; actual: number;
  status: SLATarget['status']; period: SLATarget['period'];
}

export async function listSla(workspaceId: string): Promise<SLATarget[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('sla_targets')
    .select('id, workspace_id, name, metric, target, actual, status, period')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as SlaRow;
    return {
      id: row.id, workspaceId: row.workspace_id, name: row.name,
      metric: row.metric, target: Number(row.target), actual: Number(row.actual),
      status: row.status, period: row.period,
    };
  });
}

interface BrandingRow {
  workspace_id: string; workspace_name: string;
  primary_color: string; accent_color: string;
  logo_url: string | null; custom_domain: string | null;
  email_from_name: string; email_from_address: string;
  login_background_url: string | null; footer_text: string;
}

export async function listBranding(): Promise<BrandingConfig[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('branding_configs')
    .select('workspace_id, workspace_name, primary_color, accent_color, logo_url, custom_domain, email_from_name, email_from_address, login_background_url, footer_text')
    .order('workspace_name');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as BrandingRow;
    return {
      workspaceId: row.workspace_id, workspaceName: row.workspace_name,
      primaryColor: row.primary_color, accentColor: row.accent_color,
      logoUrl: row.logo_url ?? undefined, customDomain: row.custom_domain ?? undefined,
      emailFromName: row.email_from_name, emailFromAddress: row.email_from_address,
      loginBackgroundUrl: row.login_background_url ?? undefined,
      footerText: row.footer_text,
    };
  });
}

export async function inviteMember(params: {
  workspaceId: string; name: string; email: string; role: Member['role'];
}): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('workspace_members').insert({
    workspace_id: params.workspaceId, name: params.name,
    email: params.email, role: params.role, status: 'invited',
  });
  if (error) throw error;
}
