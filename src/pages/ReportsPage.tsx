import { useState } from 'react';
import {
  FileBarChart, Plus, Mail, MessageSquare, FileText, Phone,
  Power, Clock, TrendingUp, TrendingDown, AlertTriangle,
  Send, CheckCircle2, XCircle, Calendar,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_REPORT_SCHEDULES, SEED_REPORT_RUNS,
  type ReportSchedule, type ReportRun, type ReportChannel,
} from '@/lib/seed-reports';

const CHANNEL_ICON: Record<ReportChannel, typeof Mail> = {
  email: Mail,
  slack: MessageSquare,
  pdf: FileText,
  whatsapp: Phone,
};

export function ReportsPage() {
  const [tab, setTab] = useState<'schedules' | 'history'>('schedules');
  const [schedules, setSchedules] = useState<ReportSchedule[]>(SEED_REPORT_SCHEDULES);

  const toggle = (id: string) => setSchedules((c) => c.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <FileBarChart size={16} className="text-creme-mute" /> Reports executivos
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · agendados · gerados por agente · multi-canal
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
          <Plus size={11} /> Novo agendamento
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <button
          onClick={() => setTab('schedules')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px', tab === 'schedules' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}
        >
          <Calendar size={13} /> Agendamentos
          <span className="text-[11px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright">{schedules.length}</span>
        </button>
        <button
          onClick={() => setTab('history')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px', tab === 'history' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}
        >
          <Send size={13} /> Histórico
          <span className="text-[11px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-faint">{SEED_REPORT_RUNS.length}</span>
        </button>
      </div>

      {tab === 'schedules' && (
        <div className="space-y-2.5">
          {schedules.map((s) => <ScheduleCard key={s.id} schedule={s} onToggle={() => toggle(s.id)} />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2.5">
          {SEED_REPORT_RUNS.map((r) => <RunCard key={r.id} run={r} />)}
        </div>
      )}
    </>
  );
}

function ScheduleCard({ schedule: s, onToggle }: { schedule: ReportSchedule; onToggle: () => void }) {
  return (
    <div className={clsx(
      'bg-surface-2 border rounded-[10px] p-4 transition-all',
      s.enabled ? 'border-default hover:border-hover' : 'border-default opacity-60',
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme">{s.name}</h4>
            <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright uppercase tracking-wider">
              {s.frequency}
            </span>
          </div>
          <div className="text-[11.5px] text-creme-faint font-mono mt-1">
            Workspace: <span className="text-creme-dim">{s.workspaceName}</span>
          </div>
        </div>
        <button onClick={onToggle} className={clsx('p-2 rounded-md', s.enabled ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>
          <Power size={13} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Field label="Próx. envio">
          <div className="text-[12px] font-mono text-creme inline-flex items-center gap-1">
            <Clock size={10} className="text-brand-bright" />
            {new Date(s.nextRunAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </Field>
        <Field label="Último">
          <div className="text-[12px] font-mono text-creme-mute">
            {s.lastSentAt ? new Date(s.lastSentAt).toLocaleDateString('pt-BR') : '—'}
          </div>
        </Field>
        <Field label="Canais">
          <div className="flex items-center gap-1">
            {s.channels.map((ch) => {
              const Icon = CHANNEL_ICON[ch];
              return <span key={ch} title={ch}><Icon size={12} className="text-creme-mute" /></span>;
            })}
          </div>
        </Field>
        <Field label="Destinatários">
          <div className="text-[12px] font-mono text-creme-mute">{s.recipients.length}</div>
        </Field>
      </div>

      <div>
        <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">Seções incluídas</div>
        <div className="flex flex-wrap gap-1">
          {s.sections.map((sec) => (
            <span key={sec} className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-dim">{sec}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-default text-[11px] text-creme-faint font-mono flex items-center gap-2">
        Para: {s.recipients.slice(0, 2).join(', ')}{s.recipients.length > 2 && ` +${s.recipients.length - 2}`}
      </div>
    </div>
  );
}

function RunCard({ run: r }: { run: ReportRun }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
      <div className="p-4 border-b border-default flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-[13.5px] font-bold text-creme">{r.scheduleName}</h4>
          <div className="text-[11px] text-creme-faint font-mono mt-0.5">
            {r.workspaceName} · {new Date(r.generatedAt).toLocaleString('pt-BR')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-mono',
            r.status === 'sent' ? 'bg-semantic-green/15 text-semantic-green' :
            r.status === 'failed' ? 'bg-semantic-red/15 text-semantic-red' :
            'bg-semantic-amber/15 text-semantic-amber',
          )}>
            {r.status === 'sent' ? <CheckCircle2 size={10} /> : r.status === 'failed' ? <XCircle size={10} /> : <Clock size={10} />}
            {r.status === 'sent' ? `enviado p/ ${r.recipientsCount}` : r.status}
          </span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4">
        <div>
          <h5 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">KPIs</h5>
          <div className="space-y-1.5">
            {r.kpis.map((k) => (
              <div key={k.label} className="flex items-center justify-between p-2 rounded-md bg-surface-1 border border-default">
                <span className="text-[12px] text-creme-mute">{k.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold font-mono text-creme">{k.value}</span>
                  {k.trend !== 0 && (
                    <span className={clsx(
                      'inline-flex items-center gap-0.5 text-[10.5px] font-mono',
                      k.trend > 0 ? 'text-semantic-green' : 'text-semantic-red',
                    )}>
                      {k.trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {(Math.abs(k.trend) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h5 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">Highlights</h5>
          <ul className="space-y-1.5 mb-3">
            {r.highlights.map((h, i) => (
              <li key={i} className="text-[12px] text-creme-mute leading-snug pl-3 relative">
                <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-brand-bright" />
                {h}
              </li>
            ))}
          </ul>
          {r.alerts.length > 0 && (
            <>
              <h5 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2 flex items-center gap-1">
                <AlertTriangle size={10} className="text-semantic-amber" /> Alertas
              </h5>
              <ul className="space-y-1">
                {r.alerts.map((a, i) => (
                  <li key={i} className="text-[12px] text-semantic-amber leading-snug pl-3 relative">
                    <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-semantic-amber" />
                    {a}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint mb-0.5">{label}</div>
      {children}
    </div>
  );
}
