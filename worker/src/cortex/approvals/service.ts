/**
 * Cortex M1 — Approval Queue.
 *
 * Ações com risk_level ≥ 3 podem ser enfileiradas pra aprovação humana.
 * Brain/agente cria approval, notifica responsável, e aguarda decisão.
 */

import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';
import { notify } from '../notifications/service.js';
import { resumeWorkflow } from '../workflows/engine.js';

const logger = createLogger('cortex.approvals');

export interface RequestApprovalInput {
  tenantId: string;
  source: string;
  traceId?: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  riskLevel: 0 | 1 | 2 | 3 | 4;
  context: string;
  expiresInMs?: number;
  resumeWorkflowRun?: number;
}

export async function requestApproval(input: RequestApprovalInput): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const expiresAt = input.expiresInMs
    ? new Date(Date.now() + input.expiresInMs).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7d default

  const { data, error } = await supabase
    .from('cortex_approvals')
    .insert({
      tenant_id: input.tenantId,
      source: input.source,
      trace_id: input.traceId ?? null,
      action_type: input.actionType,
      action_payload: input.actionPayload,
      risk_level: input.riskLevel,
      context: input.context.slice(0, 1000),
      status: 'pending',
      expires_at: expiresAt,
      resume_workflow_run: input.resumeWorkflowRun ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    logger.warn('requestApproval failed', { error: error?.message });
    return null;
  }

  // Notifica owners do tenant (in_app)
  const { data: owners } = await supabase
    .from('cortex_user_tenants')
    .select('user_id')
    .eq('tenant_id', input.tenantId)
    .in('role', ['owner', 'admin']);

  for (const o of owners ?? []) {
    await notify({
      tenantId: input.tenantId,
      userId: o.user_id as string,
      channel: 'in_app',
      title: `Aprovação pendente: ${input.actionType}`,
      body: input.context,
      category: 'approval',
      priority: input.riskLevel >= 4 ? 'urgent' : 'high',
      source: `approval:${data.id}`,
    });
  }

  return { id: data.id as string };
}

export async function decide(
  approvalId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  reason?: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('cortex_approvals')
    .update({
      status: decision,
      decided_by: decidedBy,
      decision_reason: reason ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .eq('status', 'pending')
    .select('resume_workflow_run')
    .maybeSingle();

  if (error || !data) return false;

  if (data.resume_workflow_run) {
    await resumeWorkflow(data.resume_workflow_run as number, decision);
  }
  return true;
}

export async function listPending(tenantId: string): Promise<unknown[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('cortex_approvals')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  return data ?? [];
}
