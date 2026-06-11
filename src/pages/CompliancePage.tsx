import { useEffect, useState } from 'react';
import {
  FileCheck, CheckCircle2, AlertTriangle, XCircle, Download,
  Clock, ShieldCheck, FileText, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_COMPLIANCE_BUILDS, type CompliancePackBuild } from '@/lib/seed-final';
import * as complianceService from '@/services/compliance';

const STATUS_META = {
  idle: { label: 'não iniciado', color: 'bg-surface-3 text-creme-mute' },
  building: { label: 'gerando', color: 'bg-semantic-amber/15 text-semantic-amber' },
  ready: { label: 'pronto', color: 'bg-semantic-green/15 text-semantic-green' },
  expired: { label: 'expirado', color: 'bg-semantic-red/15 text-semantic-red' },
};

const WORKSPACE_ID = 'ws_texnet';

export function CompliancePage() {
  const [builds, setBuilds] = useState<CompliancePackBuild[]>(SEED_COMPLIANCE_BUILDS);
  const [selectedId, setSelectedId] = useState<string>(SEED_COMPLIANCE_BUILDS[0]?.id ?? '');
  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const selected = builds.find((b) => b.id === selectedId);

  useEffect(() => {
    if (!complianceService.complianceConfigured) return;
    complianceService.listPackBuilds(WORKSPACE_ID).then((rows) => {
      if (rows.length > 0) {
        setBuilds(rows);
        setSelectedId(rows[0].id);
        setSource('live');
      }
    }).catch(() => {});
  }, []);

  const startBuild = (id: string) => {
    setBuilds((curr) => curr.map((b) => (b.id === id ? { ...b, status: 'building' } : b)));
    if (source === 'live') complianceService.startBuild(id).catch(() => {});
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <FileCheck size={16} className="text-creme-mute" /> Compliance Report Builder
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · LGPD · SOC 2 · ISO 27001 · evidence packs prontos pra auditor
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${builds.length} packs` : 'mock'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-3 h-[calc(100vh-160px)] min-h-[500px]">
        <div className="space-y-2">
          {builds.map((b) => <PackRow key={b.id} pack={b} selected={b.id === selectedId} onClick={() => setSelectedId(b.id)} />)}
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] overflow-y-auto">
          {selected && <PackDetail pack={selected} onBuild={() => startBuild(selected.id)} />}
        </div>
      </div>
    </>
  );
}

function PackRow({ pack: b, selected, onClick }: { pack: CompliancePackBuild; selected: boolean; onClick: () => void }) {
  const meta = STATUS_META[b.status];
  const okSections = b.sections.filter((s) => s.status === 'ok').length;
  const progress = b.sections.length ? (okSections / b.sections.length) * 100 : 0;

  return (
    <button onClick={onClick} className={clsx(
      'w-full text-left p-4 rounded-[10px] border transition-all',
      selected ? 'bg-brand/10 border-brand/30' : 'bg-surface-2 border-default hover:border-hover',
    )}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-1 border border-default flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-brand-bright" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={clsx('text-[13.5px] font-bold truncate', selected ? 'text-brand-bright' : 'text-creme')}>{b.packLabel}</h4>
          </div>
          <span className={clsx('inline-flex items-center px-1.5 py-px rounded-full text-[10.5px] font-mono mt-1', meta.color)}>{meta.label}</span>
          <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden mt-2">
            <div className={clsx('h-full', progress === 100 ? 'bg-semantic-green' : progress >= 70 ? 'bg-semantic-amber' : 'bg-semantic-red')} style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[10.5px] font-mono text-creme-faint mt-1.5">
            {okSections}/{b.sections.length} controles · {b.evidenceCount} evidências
          </div>
        </div>
      </div>
    </button>
  );
}

function PackDetail({ pack: b, onBuild }: { pack: CompliancePackBuild; onBuild: () => void }) {
  const meta = STATUS_META[b.status];
  const okSections = b.sections.filter((s) => s.status === 'ok').length;
  const warningSections = b.sections.filter((s) => s.status === 'warning').length;
  const missingSections = b.sections.filter((s) => s.status === 'missing').length;

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[17px] font-bold text-creme">{b.packLabel}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full', meta.color)}>{meta.label}</span>
            {b.buildedAt && <span className="text-[10.5px] font-mono text-creme-faint">build {new Date(b.buildedAt).toLocaleDateString('pt-BR')}</span>}
            {b.validUntil && <span className="text-[10.5px] font-mono text-creme-faint">válido até {new Date(b.validUntil).toLocaleDateString('pt-BR')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {b.status === 'ready' && (
            <button className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1">
              <Download size={11} /> Baixar PDF
            </button>
          )}
          {b.status === 'idle' && (
            <button onClick={onBuild} className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1">
              <FileText size={11} /> Gerar pack
            </button>
          )}
          {b.status === 'building' && (
            <span className="px-3 py-1.5 rounded-md bg-semantic-amber/15 text-semantic-amber text-[12px] font-semibold inline-flex items-center gap-1">
              <Clock size={11} className="animate-spin" /> Gerando...
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <Stat label="OK" value={okSections.toString()} color="green" />
        <Stat label="Warning" value={warningSections.toString()} color="amber" />
        <Stat label="Faltando" value={missingSections.toString()} color="red" />
      </div>

      <h4 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Controles</h4>
      <div className="space-y-1.5">
        {b.sections.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-surface-1 border border-default">
            {s.status === 'ok' && <CheckCircle2 size={14} className="text-semantic-green shrink-0" />}
            {s.status === 'warning' && <AlertTriangle size={14} className="text-semantic-amber shrink-0" />}
            {s.status === 'missing' && <XCircle size={14} className="text-semantic-red shrink-0" />}
            <span className={clsx('text-[12.5px] flex-1', s.status === 'ok' ? 'text-creme' : 'text-creme-mute')}>{s.name}</span>
            {s.status !== 'ok' && (
              <button className="text-[10.5px] font-mono text-brand-bright hover:underline">resolver</button>
            )}
          </div>
        ))}
      </div>

      {b.status === 'ready' && (
        <div className="mt-4 bg-semantic-green/5 border border-semantic-green/20 rounded-md p-3 text-[12px] text-creme-mute leading-relaxed">
          <CheckCircle2 size={13} className="inline mr-1.5 text-semantic-green" />
          <b className="text-creme">Pack pronto pra entregar.</b> Contém {b.evidenceCount} evidências (logs, screenshots, políticas, configs).
          Auditor recebe um único PDF + ZIP. Re-gere após mudanças relevantes.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: 'green' | 'amber' | 'red' }) {
  return (
    <div className={clsx('rounded-md p-2.5 text-center',
      color === 'green' ? 'bg-semantic-green/10 border border-semantic-green/30' :
      color === 'amber' ? 'bg-semantic-amber/10 border border-semantic-amber/30' :
      'bg-semantic-red/10 border border-semantic-red/30',
    )}>
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[18px] font-bold font-mono mt-0.5',
        color === 'green' ? 'text-semantic-green' : color === 'amber' ? 'text-semantic-amber' : 'text-semantic-red',
      )}>{value}</div>
    </div>
  );
}
