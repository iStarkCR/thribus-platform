/**
 * Compliance Pack Builder — processa builds marcados como 'building' pelo painel.
 *
 * Coleta evidências reais do workspace (DSR, PII, consent, retenção, audit,
 * secrets, membros) e monta as sections do pack com status ok/warning/missing.
 * Marca ready com validade de 90 dias.
 *
 * Roda em loop (60s). Cada passada processa todos os builds pendentes.
 */

import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger('cortex.compliance');

const INTERVAL_MS = Number(process.env.COMPLIANCE_BUILDER_INTERVAL_MS ?? 60_000);
const VALIDITY_DAYS = 90;

interface Evidence {
  dsrResolved30d: number;
  dsrTotal: number;
  piiDetections: number;
  consentRecords: number;
  retentionConfigured: boolean;
  residencyLocked: boolean;
  auditEntries: number;
  secretsStored: number;
  members: number;
  membersWith2fa: number;
}

type SectionStatus = 'ok' | 'warning' | 'missing';
interface Section { name: string; status: SectionStatus }

async function count(table: string, workspaceId: string, extra?: (q: any) => any): Promise<number> {
  let q = supabase!.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
  if (extra) q = extra(q);
  const { count: c } = await q;
  return c ?? 0;
}

async function collectEvidence(workspaceId: string): Promise<Evidence> {
  const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [dsrResolved30d, dsrTotal, piiDetections, consentRecords, auditEntries, secretsStored, members, membersWith2fa, retention] =
    await Promise.all([
      count('lgpd_dsr_requests', workspaceId, (q) => q.eq('status', 'completed').gte('created_at', cutoff30d)),
      count('lgpd_dsr_requests', workspaceId),
      count('lgpd_pii_detections', workspaceId),
      count('lgpd_consent_log', workspaceId),
      count('audit_log', workspaceId),
      count('workspace_secrets', workspaceId),
      count('workspace_members', workspaceId),
      count('workspace_members', workspaceId, (q) => q.eq('two_factor_enabled', true)),
      supabase!.from('retention_policies').select('data_residency_locked').eq('workspace_id', workspaceId).maybeSingle(),
    ]);

  return {
    dsrResolved30d, dsrTotal, piiDetections, consentRecords,
    retentionConfigured: Boolean(retention.data),
    residencyLocked: Boolean((retention.data as { data_residency_locked?: boolean } | null)?.data_residency_locked),
    auditEntries, secretsStored, members, membersWith2fa,
  };
}

function has(n: number): SectionStatus {
  return n > 0 ? 'ok' : 'missing';
}

function buildSections(pack: string, ev: Evidence): Section[] {
  const common: Section[] = [
    { name: `RBAC — ${ev.members} membros, ${ev.membersWith2fa} com 2FA`, status: ev.members === 0 ? 'missing' : ev.membersWith2fa < ev.members ? 'warning' : 'ok' },
    { name: `Audit log imutável — ${ev.auditEntries} eventos`, status: has(ev.auditEntries) },
    { name: 'Retenção configurada por workspace', status: ev.retentionConfigured ? 'ok' : 'missing' },
    { name: `Secrets cifrados em rest — ${ev.secretsStored} credenciais no vault`, status: has(ev.secretsStored) },
  ];

  switch (pack) {
    case 'lgpd':
    case 'gdpr':
      return [
        { name: `DSR workflow (Art. 18) — ${ev.dsrResolved30d} resolvidos /30d de ${ev.dsrTotal} totais`, status: ev.dsrTotal > 0 ? 'ok' : 'warning' },
        { name: `Consent log com base legal — ${ev.consentRecords} registros`, status: has(ev.consentRecords) },
        { name: `PII Scanner ativo — ${ev.piiDetections} detecções tratadas`, status: ev.piiDetections > 0 ? 'ok' : 'warning' },
        { name: 'Data residency BR (sa-east-1)', status: ev.residencyLocked ? 'ok' : 'warning' },
        ...common,
      ];
    case 'soc2':
      return [
        ...common,
        { name: `Privacy — DSR + consent (${ev.dsrTotal} DSR, ${ev.consentRecords} consents)`, status: ev.dsrTotal + ev.consentRecords > 0 ? 'ok' : 'warning' },
        { name: 'Processing Integrity — eval suites em CI', status: 'warning' },
        { name: 'Penetration test anual', status: 'missing' },
      ];
    case 'iso27001':
      return [
        { name: 'ISMS escopo definido', status: 'missing' },
        { name: 'Risk assessment documentado', status: 'missing' },
        { name: 'Statement of Applicability', status: 'missing' },
        ...common,
      ];
    case 'pci_dss':
      return [
        { name: 'Cartão tokenizado no gateway (Asaas/Stripe) — sem PAN em banco próprio', status: 'ok' },
        { name: `PII Scanner bloqueia cartão em chat — ${ev.piiDetections} detecções`, status: ev.piiDetections > 0 ? 'ok' : 'warning' },
        ...common,
      ];
    default:
      return common;
  }
}

async function processBuild(build: { id: string; workspace_id: string; pack: string }): Promise<void> {
  const ev = await collectEvidence(build.workspace_id);
  const sections = buildSections(build.pack, ev);
  const evidenceCount =
    ev.dsrTotal + ev.piiDetections + ev.consentRecords + ev.auditEntries +
    ev.secretsStored + ev.members + (ev.retentionConfigured ? 1 : 0);

  const { error } = await supabase!
    .from('compliance_pack_builds')
    .update({
      status: 'ready',
      sections,
      evidence_count: evidenceCount,
      builded_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + VALIDITY_DAYS * 86_400_000).toISOString(),
    })
    .eq('id', build.id)
    .eq('status', 'building');
  if (error) throw error;
  logger.info('compliance pack built', {
    id: build.id, pack: build.pack, workspaceId: build.workspace_id,
    sections: sections.length, evidence: evidenceCount,
  });
}

export async function runComplianceBuilderPass(): Promise<{ built: number }> {
  if (!supabase) return { built: 0 };
  const { data: pending } = await supabase
    .from('compliance_pack_builds')
    .select('id, workspace_id, pack')
    .eq('status', 'building')
    .limit(10);

  let built = 0;
  for (const build of pending ?? []) {
    try {
      await processBuild(build as { id: string; workspace_id: string; pack: string });
      built += 1;
    } catch (err) {
      logger.warn('compliance build failed', { id: build.id, error: (err as Error).message });
    }
  }
  return { built };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startComplianceBuilder(): void {
  if (intervalHandle || !supabase) return;
  logger.info('compliance builder started', { intervalMs: INTERVAL_MS });
  intervalHandle = setInterval(() => {
    void runComplianceBuilderPass().catch((err) =>
      logger.error('compliance builder pass failed', { error: (err as Error).message }),
    );
  }, INTERVAL_MS);
  intervalHandle.unref?.();
}

export function stopComplianceBuilder(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('compliance builder stopped');
  }
}
