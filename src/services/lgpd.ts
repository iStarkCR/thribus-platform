/**
 * LGPD — DSR requests, consent log, PII detections.
 */

import { supabase } from '@/lib/supabase';

export const lgpdConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

export type DsrKind = 'access' | 'rectify' | 'erase' | 'portability' | 'restriction' | 'objection';
export type DsrStatus = 'received' | 'verifying' | 'processing' | 'completed' | 'denied';

export interface DsrRequest {
  id: string;
  workspaceId: string;
  subjectName: string;
  subjectEmail?: string;
  subjectPhone?: string;
  subjectDoc?: string;
  kind: DsrKind;
  description?: string;
  status: DsrStatus;
  dueDate: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  subjectId: string;
  purpose: string;
  legalBasis: string;
  granted: boolean;
  evidenceText?: string;
  grantedAt: string;
  revokedAt?: string;
}

export interface PIIDetection {
  id: string;
  conversationId?: string;
  piiKind: string;
  maskedExcerpt: string;
  actionTaken: string;
  detectedAt: string;
}

interface DsrRow {
  id: string; workspace_id: string; subject_name: string;
  subject_email: string | null; subject_phone: string | null; subject_doc: string | null;
  kind: DsrKind; description: string | null; status: DsrStatus;
  due_date: string; resolved_at: string | null; resolution_notes: string | null;
  created_at: string;
}

function rowToDsr(r: DsrRow): DsrRequest {
  return {
    id: r.id, workspaceId: r.workspace_id, subjectName: r.subject_name,
    subjectEmail: r.subject_email ?? undefined, subjectPhone: r.subject_phone ?? undefined,
    subjectDoc: r.subject_doc ?? undefined, kind: r.kind, description: r.description ?? undefined,
    status: r.status, dueDate: r.due_date,
    resolvedAt: r.resolved_at ?? undefined, resolutionNotes: r.resolution_notes ?? undefined,
    createdAt: r.created_at,
  };
}

export async function listDsrRequests(workspaceId: string): Promise<DsrRequest[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('lgpd_dsr_requests')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDsr(r as DsrRow));
}

export async function createDsrRequest(params: {
  workspaceId: string; subjectName: string; kind: DsrKind;
  subjectEmail?: string; subjectPhone?: string; subjectDoc?: string;
  description?: string;
}): Promise<DsrRequest> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('lgpd_dsr_requests')
    .insert({
      workspace_id: params.workspaceId,
      subject_name: params.subjectName,
      subject_email: params.subjectEmail,
      subject_phone: params.subjectPhone,
      subject_doc: params.subjectDoc,
      kind: params.kind,
      description: params.description,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToDsr(data as DsrRow);
}

export async function processDsr(dsrId: string): Promise<unknown> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data: dsr } = await supabase
    .from('lgpd_dsr_requests')
    .select('kind')
    .eq('id', dsrId)
    .single();
  if (!dsr) throw new Error('DSR não encontrado');

  const fn = dsr.kind === 'erase' ? 'lgpd-erase' : 'lgpd-export';
  const { data, error } = await supabase.functions.invoke(fn, { body: { dsr_id: dsrId } });
  if (error) throw error;
  return data;
}

export async function listPIIDetections(workspaceId: string, limit = 50): Promise<PIIDetection[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('lgpd_pii_detections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('detected_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    conversationId: (r.conversation_id as string) ?? undefined,
    piiKind: r.pii_kind as string,
    maskedExcerpt: r.masked_excerpt as string,
    actionTaken: r.action_taken as string,
    detectedAt: r.detected_at as string,
  }));
}

export async function listConsents(workspaceId: string, limit = 50): Promise<ConsentRecord[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('lgpd_consent_log')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('granted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    purpose: r.purpose as string,
    legalBasis: r.legal_basis as string,
    granted: r.granted as boolean,
    evidenceText: (r.evidence_text as string) ?? undefined,
    grantedAt: r.granted_at as string,
    revokedAt: (r.revoked_at as string) ?? undefined,
  }));
}
