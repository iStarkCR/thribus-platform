import { useEffect, useState } from 'react';
import {
  Activity, CheckCircle2, AlertTriangle, XCircle, Wrench,
  Clock, RefreshCw, ExternalLink, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_SERVICES, SEED_INCIDENTS,
  type ServiceStatus, type ServiceHealth, type Incident,
} from '@/lib/seed-extras2';
import * as platform from '@/services/platform';

const HEALTH_META: Record<ServiceHealth, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  operational: { label: 'operacional', color: 'text-semantic-green', bg: 'bg-semantic-green/10', Icon: CheckCircle2 },
  degraded: { label: 'degradado', color: 'text-semantic-amber', bg: 'bg-semantic-amber/10', Icon: AlertTriangle },
  outage: { label: 'fora do ar', color: 'text-semantic-red', bg: 'bg-semantic-red/10', Icon: XCircle },
  maintenance: { label: 'manutenção', color: 'text-brand-bright', bg: 'bg-brand/10', Icon: Wrench },
};

const SEVERITY_COLOR = {
  minor: 'bg-semantic-amber/15 text-semantic-amber',
  major: 'bg-semantic-red/15 text-semantic-red',
  critical: 'bg-semantic-red/30 text-semantic-red',
};

function mapComponentHealth(status: platform.StatusComponent['status']): ServiceHealth {
  if (status === 'operational') return 'operational';
  if (status === 'maintenance') return 'maintenance';
  if (status === 'major_outage') return 'outage';
  return 'degraded';
}

export function StatusPage() {
  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [services, setServices] = useState<ServiceStatus[]>(SEED_SERVICES);
  const [incidents, setIncidents] = useState<Incident[]>(SEED_INCIDENTS);

  useEffect(() => {
    if (!platform.platformConfigured) return;
    Promise.allSettled([
      platform.listStatusComponents().then((rows) => {
        if (rows.length > 0) {
          setServices(rows.map((c) => ({
            id: c.id, name: c.name, category: 'core' as const,
            health: mapComponentHealth(c.status),
            uptime30d: c.uptime30dPct, latencyMs: 0,
          })));
          setSource('live');
        }
      }),
      platform.listStatusIncidents().then((rows) => {
        if (rows.length > 0) {
          setIncidents(rows.map((i) => ({
            id: i.id, title: i.title, severity: i.severity, status: i.status,
            affectedServices: [], startedAt: i.startedAt,
            resolvedAt: i.resolvedAt, updates: i.updates,
          })));
        }
      }),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) console.warn('[Status] live parcial:', failed.length, 'falhas');
    });
  }, []);

  const allOk = services.every((s) => s.health === 'operational');
  const degraded = services.filter((s) => s.health === 'degraded' || s.health === 'maintenance');
  const down = services.filter((s) => s.health === 'outage');
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');

  const overallColor = down.length ? 'bg-semantic-red/10 border-semantic-red/30' : degraded.length ? 'bg-semantic-amber/10 border-semantic-amber/30' : 'bg-semantic-green/10 border-semantic-green/30';
  const overallText = down.length ? 'text-semantic-red' : degraded.length ? 'text-semantic-amber' : 'text-semantic-green';
  const overallLabel = down.length ? `${down.length} serviço(s) fora do ar` : degraded.length ? `${degraded.length} serviço(s) com problema` : 'Todos os sistemas operacionais';

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Activity size={16} className="text-creme-mute" /> Status público
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · status.thribus.com.br · histórico 90d · subscribers via email/RSS
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${services.length} componentes` : 'mock'}
          </span>
        </div>
        <a href="#" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme hover:border-hover transition-all inline-flex items-center gap-1">
          <ExternalLink size={11} /> Ver página pública
        </a>
      </div>

      <div className={clsx('rounded-[10px] border-2 p-5 mb-4', overallColor)}>
        <div className="flex items-center gap-3">
          {allOk ? <CheckCircle2 size={28} className={overallText} /> : <AlertTriangle size={28} className={overallText} />}
          <div>
            <h2 className={clsx('text-[18px] font-bold', overallText)}>{overallLabel}</h2>
            <p className="text-[12px] text-creme-mute mt-0.5">Última verificação: {new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
        </div>
      </div>

      {activeIncidents.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Incidentes ativos</h3>
          <div className="space-y-2">
            {activeIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)}
          </div>
        </div>
      )}

      <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Serviços</h3>
      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        {services.map((s) => <ServiceRow key={s.id} service={s} />)}
      </div>

      <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mt-4 mb-2">Incidentes resolvidos /30d</h3>
      <div className="space-y-2">
        {incidents.filter((i) => i.status === 'resolved').map((i) => <IncidentCard key={i.id} incident={i} compact />)}
      </div>
    </>
  );
}

function ServiceRow({ service: s }: { service: ServiceStatus }) {
  const meta = HEALTH_META[s.health];
  const Icon = meta.Icon;
  return (
    <div className="grid grid-cols-[1fr_120px_120px_140px] gap-3 px-4 py-3 border-b border-default last:border-b-0 items-center">
      <div>
        <div className="text-[13px] font-semibold text-creme">{s.name}</div>
        <code className="text-[10.5px] font-mono text-creme-faint">{s.category}</code>
      </div>
      <div className={clsx('text-[11px] font-mono inline-flex items-center gap-1.5', meta.color)}>
        <Icon size={11} />
        {meta.label}
      </div>
      <div className="text-[12px] font-mono">
        <span className={s.uptime30d >= 99.9 ? 'text-semantic-green' : s.uptime30d >= 99 ? 'text-semantic-amber' : 'text-semantic-red'}>
          {s.uptime30d.toFixed(2)}%
        </span>
        <div className="text-[10px] text-creme-faint">uptime 30d</div>
      </div>
      <div className="text-[12px] font-mono text-creme-mute">{s.latencyMs > 0 ? `${s.latencyMs}ms` : '—'}</div>
    </div>
  );
}

function IncidentCard({ incident: i, compact }: { incident: Incident; compact?: boolean }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[13.5px] font-bold text-creme">{i.title}</h4>
          <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', SEVERITY_COLOR[i.severity])}>
            {i.severity}
          </span>
          <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-mute uppercase tracking-wider">
            {i.status}
          </span>
        </div>
        <div className="text-[10.5px] font-mono text-creme-faint shrink-0">
          <Clock size={10} className="inline mr-1" />
          {new Date(i.startedAt).toLocaleString('pt-BR')}
        </div>
      </div>

      {!compact && (
        <div className="space-y-1.5 mt-3 pt-3 border-t border-default">
          {i.updates.map((u, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[11.5px]">
              <RefreshCw size={10} className="text-creme-faint shrink-0 mt-0.5" />
              <span className="text-creme-mute leading-snug">{u.message}</span>
              <span className="ml-auto text-[10px] font-mono text-creme-faint shrink-0">
                {new Date(u.timestamp).toLocaleTimeString('pt-BR').slice(0, 5)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
