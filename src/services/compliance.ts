/**
 * Compliance — evidence packs (LGPD / SOC 2 / ISO 27001 / GDPR / PCI DSS).
 *
 * Build do pack é assíncrono: o painel marca 'building' e o worker
 * coleta evidências e finaliza pra 'ready'.
 */

import { supabase } from '@/lib/supabase';
import type { CompliancePackBuild } from '@/lib/seed-final';

export const complianceConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface BuildRow {
  id: string; workspace_id: string;
  pack: CompliancePackBuild['pack']; pack_label: string;
  status: CompliancePackBuild['status'];
  sections: CompliancePackBuild['sections'];
  evidence_count: number;
  builded_at: string | null; valid_until: string | null;
}

export async function listPackBuilds(workspaceId: string): Promise<CompliancePackBuild[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('compliance_pack_builds')
    .select('id, workspace_id, pack, pack_label, status, sections, evidence_count, builded_at, valid_until')
    .eq('workspace_id', workspaceId)
    .order('pack');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as BuildRow;
    return {
      id: row.id, pack: row.pack, packLabel: row.pack_label,
      workspaceId: row.workspace_id, status: row.status,
      sections: row.sections, evidenceCount: row.evidence_count,
      buildedAt: row.builded_at ?? undefined,
      validUntil: row.valid_until ?? undefined,
    };
  });
}

export async function startBuild(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('compliance_pack_builds')
    .update({ status: 'building' })
    .eq('id', id)
    .in('status', ['idle', 'expired']);
  if (error) throw error;
}
