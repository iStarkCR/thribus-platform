/**
 * Integrações — catálogo global, fila de aprovação de ações destrutivas
 * e custom tools por workspace.
 */

import { supabase } from '@/lib/supabase';
import { logAudit } from '@/services/governance';
import type { Integration, ToolApprovalRequest, CustomToolDef } from '@/lib/seed-integrations';

export const integrationsConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface CatalogRow {
  id: string; name: string; vendor: string;
  category: Integration['category']; description: string;
  logo_emoji: string; logo_slug: string | null;
  status: Integration['status']; tool_count: number; connected_workspaces: number;
  auth_type: Integration['authType']; destructive: boolean; popular: boolean;
  docs_url: string | null; install_count: number;
}

export async function listCatalog(): Promise<Integration[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('integrations_catalog')
    .select('id, name, vendor, category, description, logo_emoji, logo_slug, status, tool_count, connected_workspaces, auth_type, destructive, popular, docs_url, install_count')
    .order('install_count', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as CatalogRow;
    return {
      id: row.id, name: row.name, vendor: row.vendor,
      category: row.category, description: row.description,
      logoEmoji: row.logo_emoji, logoSlug: row.logo_slug ?? undefined,
      status: row.status, toolCount: row.tool_count,
      connectedWorkspaces: row.connected_workspaces,
      authType: row.auth_type, destructive: row.destructive,
      popular: row.popular || undefined,
      docsUrl: row.docs_url ?? undefined,
      installCount: row.install_count,
    };
  });
}

interface ApprovalRow {
  id: string; workspace_id: string; agent_id: string | null; agent_name: string;
  tool_name: string; integration_id: string | null;
  payload: Record<string, unknown>; reason: string;
  status: ToolApprovalRequest['status'];
  requested_at: string; reviewed_at: string | null;
  reviewed_by: string | null; notes: string | null;
}

export async function listApprovals(workspaceId: string, limit = 50): Promise<ToolApprovalRequest[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('tool_approvals')
    .select('id, workspace_id, agent_id, agent_name, tool_name, integration_id, payload, reason, status, requested_at, reviewed_at, reviewed_by, notes')
    .eq('workspace_id', workspaceId)
    .order('requested_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as ApprovalRow;
    return {
      id: row.id, agentId: row.agent_id ?? '', agentName: row.agent_name,
      toolName: row.tool_name, integrationId: row.integration_id ?? '',
      payload: row.payload, reason: row.reason, status: row.status,
      requestedAt: row.requested_at,
      reviewedAt: row.reviewed_at ?? undefined,
      reviewedBy: row.reviewed_by ?? undefined,
      notes: row.notes ?? undefined,
    };
  });
}

export async function reviewApproval(params: {
  id: string; decision: 'approved' | 'rejected'; reviewedBy: string; notes?: string;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('tool_approvals')
    .update({
      status: params.decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: params.reviewedBy,
      notes: params.notes ?? null,
    })
    .eq('id', params.id)
    .eq('status', 'pending')
    .select('workspace_id, tool_name')
    .maybeSingle();
  if (error) throw error;
  if (data) {
    logAudit({
      workspaceId: data.workspace_id as string,
      action: params.decision === 'approved' ? 'tool.approved' : 'tool.rejected',
      resource: 'tool_approval', resourceId: params.id,
      diff: data.tool_name as string,
    });
  }
}

interface CustomToolRow {
  id: string; workspace_id: string; name: string; description: string;
  method: CustomToolDef['method']; endpoint: string; schema_def: string;
  destructive: boolean; invocations_30d: number; error_rate: number;
  created_at: string;
}

export async function listCustomTools(workspaceId: string): Promise<CustomToolDef[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('custom_tools')
    .select('id, workspace_id, name, description, method, endpoint, schema_def, destructive, invocations_30d, error_rate, created_at')
    .eq('workspace_id', workspaceId)
    .order('invocations_30d', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as CustomToolRow;
    return {
      id: row.id, workspaceId: row.workspace_id, name: row.name,
      description: row.description, method: row.method,
      endpoint: row.endpoint, schema: row.schema_def,
      destructive: row.destructive, createdAt: row.created_at,
      invocations30d: row.invocations_30d, errorRate: Number(row.error_rate),
    };
  });
}
