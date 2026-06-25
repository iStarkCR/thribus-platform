import { useMemo } from 'react';
import { CheckCircle2, DollarSign, Clock, AlertTriangle, ListChecks, Loader2 } from 'lucide-react';
import type { Demand } from '@/services/demands';
import { formatCost, formatDuration } from './demandUtils';

/** Painel do time digital — produtividade e custo, derivado das demandas. */
export function DemandsDashboard({ demands, agentName }: { demands: Demand[]; agentName: (id: string) => string }) {
  const m = useMemo(() => {
    const done = demands.filter((d) => d.status === 'done');
    const error = demands.filter((d) => d.status === 'error');
    const totalCost = demands.reduce((s, d) => s + (d.costUsd || 0), 0);
    const durations = done.filter((d) => d.durationMs > 0).map((d) => d.durationMs);
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const errorRate = done.length + error.length ? error.length / (done.length + error.length) : 0;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const done7d = done.filter((d) => d.finishedAt && new Date(d.finishedAt).getTime() >= weekAgo).length;

    const byAgentMap = new Map<string, { done: number; cost: number; durSum: number; durN: number; errors: number }>();
    for (const d of demands) {
      const e = byAgentMap.get(d.agentId) ?? { done: 0, cost: 0, durSum: 0, durN: 0, errors: 0 };
      e.cost += d.costUsd || 0;
      if (d.status === 'done') { e.done += 1; if (d.durationMs > 0) { e.durSum += d.durationMs; e.durN += 1; } }
      if (d.status === 'error') e.errors += 1;
      byAgentMap.set(d.agentId, e);
    }
    const byAgent = [...byAgentMap.entries()]
      .map(([id, v]) => ({ id, ...v, avg: v.durN ? v.durSum / v.durN : 0 }))
      .sort((a, b) => b.done - a.done);

    return {
      counts: {
        todo: demands.filter((d) => d.status === 'todo').length,
        doing: demands.filter((d) => d.status === 'doing').length,
        waiting: demands.filter((d) => d.status === 'waiting').length,
        done: done.length,
        error: error.length,
      },
      totalCost, avgDuration, errorRate, done7d, byAgent,
    };
  }, [demands]);

  return (
    <div className="max-w-4xl space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<CheckCircle2 size={15} />} label="feitas (total)" value={String(m.counts.done)} sub={`${m.done7d} nos últimos 7 dias`} accent="text-semantic-green" />
        <Kpi icon={<DollarSign size={15} />} label="custo do time" value={formatCost(m.totalCost)} sub="execuções reais" accent="text-gold-bright" />
        <Kpi icon={<Clock size={15} />} label="tempo médio" value={formatDuration(m.avgDuration)} sub="por demanda feita" accent="text-semantic-blue" />
        <Kpi icon={<AlertTriangle size={15} />} label="taxa de erro" value={`${Math.round(m.errorRate * 100)}%`} sub={`${m.counts.error} com erro`} accent="text-semantic-red" />
      </div>

      {/* Estado da fila */}
      <div className="flex flex-wrap gap-2">
        <Pill icon={<ListChecks size={12} />} label="na fila" value={m.counts.todo} />
        <Pill icon={<Loader2 size={12} />} label="executando" value={m.counts.doing} />
        <Pill icon={<AlertTriangle size={12} />} label="aguardando você" value={m.counts.waiting} highlight={m.counts.waiting > 0} />
      </div>

      {/* Por colaborador */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-creme-faint mb-2">Por colaborador</div>
        {m.byAgent.length === 0 ? (
          <div className="text-[12.5px] text-creme-faint py-4">Sem dados ainda.</div>
        ) : (
          <div className="rounded-xl border border-default overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-creme-faint text-[10.5px] uppercase tracking-wider">
                <tr>
                  <th className="text-left font-bold px-3 py-2">Colaborador</th>
                  <th className="text-right font-bold px-3 py-2">Feitas</th>
                  <th className="text-right font-bold px-3 py-2">Erros</th>
                  <th className="text-right font-bold px-3 py-2">Tempo médio</th>
                  <th className="text-right font-bold px-3 py-2">Custo</th>
                </tr>
              </thead>
              <tbody>
                {m.byAgent.map((a) => (
                  <tr key={a.id} className="border-t border-default">
                    <td className="px-3 py-2 text-creme font-medium">{agentName(a.id)}</td>
                    <td className="px-3 py-2 text-right text-creme-dim tabular-nums">{a.done}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.errors > 0 ? <span className="text-semantic-red">{a.errors}</span> : <span className="text-creme-faint">0</span>}</td>
                    <td className="px-3 py-2 text-right text-creme-dim tabular-nums">{formatDuration(a.avg)}</td>
                    <td className="px-3 py-2 text-right text-gold-bright tabular-nums">{formatCost(a.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border border-default bg-surface-1 p-3.5">
      <div className={`flex items-center gap-1.5 ${accent}`}>{icon}<span className="text-[10.5px] font-bold uppercase tracking-wider text-creme-faint">{label}</span></div>
      <div className="text-[22px] font-bold text-creme tabular-nums mt-1.5 leading-none">{value}</div>
      <div className="text-[10.5px] text-creme-faint mt-1">{sub}</div>
    </div>
  );
}
function Pill({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] ${highlight ? 'border-semantic-amber/40 bg-semantic-amber/10 text-semantic-amber' : 'border-default bg-surface-1 text-creme-mute'}`}>
      {icon} <span className="font-bold tabular-nums">{value}</span> {label}
    </div>
  );
}
