import { useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Zap,
  Clock, Wrench, Users, DollarSign, CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { resolveCost, usdToBrl } from '@/lib/pricing';
import { resolveRange, previousPeriod, inRange, type RangeKey } from '@/lib/dateRanges';
import { DateRangeFilter } from '@/components/shared/DateRangeFilter';
import type { Execution } from '@/types';

/**
 * Métricas — visão analítica dos colaboradores digitais.
 * Calcula tudo em runtime a partir de `executions` (que já são carregadas
 * pelo store no boot). Sem queries adicionais ao Supabase.
 *
 * Filtro temporal cobre: hoje / 7d / 30d / mês atual / mês passado / 3m / 12m / all.
 * Custo é destacado em vermelho (atenção operacional) com delta MoM ↑↓ vs período anterior.
 */
export function MetricsPage() {
  const { executions, agents } = useAppStore();
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const range = resolveRange(rangeKey);
  const prevRange = previousPeriod(range);

  const computeCost = (e: Execution): number =>
    resolveCost(e.cost ?? 0, e.tokensUsed, e.model, e.cacheReadTokens ?? 0);

  // ─── Stats no período selecionado ──────────────────────────────────────────
  const stats = useMemo(() => {
    const inSel = (e: Execution) => inRange(e.timestamp, range);
    const inPrev = (e: Execution) => inRange(e.timestamp, prevRange);

    const selected = executions.filter(inSel);
    const previous = executions.filter(inPrev);

    const total = selected.length;
    const resolved = selected.filter((e) => e.status === 'resolved').length;
    const escalated = selected.filter((e) => e.status === 'escalated').length;
    const failed = selected.filter((e) => e.status === 'failed').length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const totalTokens = selected.reduce((s, e) => s + e.tokensUsed, 0);
    const totalCost = selected.reduce((s, e) => s + computeCost(e), 0);
    const prevCost = previous.reduce((s, e) => s + computeCost(e), 0);

    const avgResponseTime = total > 0
      ? selected.reduce((s, e) => s + e.responseTime, 0) / total
      : 0;

    const onlineAgents = agents.filter((a) => a.status === 'online').length;

    // Delta MoM (baseado no período anterior equivalente)
    const costDelta = prevCost > 0 ? ((totalCost - prevCost) / prevCost) * 100 : null;

    return {
      total,
      resolved,
      escalated,
      failed,
      resolutionRate,
      totalTokens,
      totalCost,
      prevCost,
      costDelta,
      avgResponseTime,
      onlineAgents,
    };
  }, [executions, agents, range, prevRange]);

  // ─── Top tools no período ──────────────────────────────────────────────────
  const topTools = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of executions.filter((x) => inRange(x.timestamp, range))) {
      for (const t of e.toolsUsed ?? []) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [executions, range]);

  // ─── Top agentes no período ────────────────────────────────────────────────
  const topAgents = useMemo(() => {
    const counts: Record<string, { name: string; client: string; count: number; cost: number }> = {};
    for (const e of executions.filter((x) => inRange(x.timestamp, range))) {
      const key = e.agentId;
      if (!counts[key]) {
        counts[key] = { name: e.agentName, client: e.clientName, count: 0, cost: 0 };
      }
      counts[key].count++;
      counts[key].cost += computeCost(e);
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [executions, range]);

  // ─── Distribuição diária dentro do período (até 30 buckets) ────────────────
  const dailyBuckets = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    const buckets: Array<{ date: string; label: string; count: number; cost: number }> = [];
    const fromTs = range.from.getTime();
    const toTs = (range.to ?? new Date()).getTime();
    const totalDays = Math.ceil((toTs - fromTs) / day);
    const stepDays = Math.max(1, Math.ceil(totalDays / 30)); // máx 30 buckets

    for (let i = 0; i < totalDays; i += stepDays) {
      const startTs = fromTs + i * day;
      const endTs = Math.min(startTs + stepDays * day, toTs);
      const d = new Date(startTs);
      const dayExecs = executions.filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        return ts >= startTs && ts < endTs;
      });
      buckets.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        count: dayExecs.length,
        cost: dayExecs.reduce((s, e) => s + computeCost(e), 0),
      });
    }
    return buckets;
  }, [executions, range]);

  const maxDayCount = Math.max(...dailyBuckets.map((d) => d.count), 1);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <BarChart3 size={16} className="text-creme-mute" /> Métricas
          <span className="text-[12px] font-normal text-creme-faint ml-2">· {range.label}</span>
        </div>
        <DateRangeFilter value={rangeKey} onChange={setRangeKey} showResolved />
      </div>

      {/* ─── KPIs hero ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard
          icon={<Activity size={14} />}
          label={`Atendimentos · ${range.label}`}
          value={stats.total}
          accent="brand"
          sub={`${stats.escalated} escalados · ${stats.failed} falhas`}
        />
        <KpiCard
          icon={<CheckCircle2 size={14} />}
          label="Taxa de Resolução"
          value={`${stats.resolutionRate}%`}
          accent="green"
          sub={`${stats.resolved} de ${stats.total} resolvidos`}
        />
        <KpiCard
          icon={<Clock size={14} />}
          label="Tempo Médio"
          value={stats.avgResponseTime > 0 ? `${stats.avgResponseTime.toFixed(1)}s` : '—'}
          accent="brand"
          sub={`${stats.total} amostras`}
        />
        <KpiCard
          icon={<DollarSign size={14} />}
          label={`Custo LLM · ${range.label}`}
          value={`$${stats.totalCost.toFixed(2)}`}
          accent="danger"
          sub={`≈ R$ ${usdToBrl(stats.totalCost).toFixed(2)}`}
          delta={stats.costDelta}
          deltaContext={`vs ${prevRange.label.toLowerCase()}`}
          isCostMetric
        />
      </div>

      {/* ─── Linha 2 — Stats secundárias ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCard
          icon={<Users size={14} />}
          label="Colaboradores Online"
          value={`${stats.onlineAgents} / ${agents.length}`}
          accent="green"
          sub="Status atual"
        />
        <KpiCard
          icon={<Zap size={14} />}
          label="Tokens (input + output, sem cache)"
          value={(stats.totalTokens / 1000).toFixed(1) + 'k'}
          accent="muted"
          sub="cache_read contado separado no custo"
        />
        <KpiCard
          icon={<DollarSign size={14} />}
          label="Custo período anterior"
          value={`$${stats.prevCost.toFixed(2)}`}
          accent="muted"
          sub={prevRange.label}
        />
      </div>

      {/* ─── Gráfico — atendimentos por dia ─────────────────────── */}
      <div className="bg-surface-2 border border-default rounded-[10px] p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-brand" />
            <h3 className="text-[14px] font-bold text-creme">Distribuição de atendimentos</h3>
          </div>
          <span className="text-[12px] text-creme-faint font-mono">{range.label}</span>
        </div>
        <div className="flex items-end gap-2 h-[120px]">
          {dailyBuckets.map((d) => {
            const heightPct = (d.count / maxDayCount) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group min-w-0">
                <div className="text-[11px] font-mono text-creme-faint group-hover:text-creme transition-colors">
                  {d.count}
                </div>
                <div className="w-full bg-surface-1 rounded-t-md overflow-hidden flex items-end" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-brand to-brand-bright rounded-t-md transition-all duration-300 hover:from-brand-bright hover:to-brand-glow"
                    style={{ height: `${heightPct}%` }}
                    title={`${d.count} atendimentos · $${d.cost.toFixed(3)}`}
                  />
                </div>
                <div className="text-[10.5px] text-creme-mute font-mono truncate max-w-full">{d.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Top tools + Top agentes (lado a lado) ──────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 border border-default rounded-[10px] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={14} className="text-brand" />
            <h3 className="text-[14px] font-bold text-creme">Tools mais usadas · {range.label}</h3>
          </div>
          {topTools.length === 0 ? (
            <p className="text-[13px] text-creme-faint italic">Nenhuma tool executada no período.</p>
          ) : (
            <div className="space-y-2">
              {topTools.map(([name, count]) => {
                const max = topTools[0][1];
                const pct = (count / max) * 100;
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-mono text-creme-dim">{name}</span>
                      <span className="font-mono text-creme-faint">{count}</span>
                    </div>
                    <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-dim to-brand-bright rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-brand" />
            <h3 className="text-[14px] font-bold text-creme">Top colaboradores · {range.label}</h3>
          </div>
          {topAgents.length === 0 ? (
            <p className="text-[13px] text-creme-faint italic">Nenhum colaborador ativo no período.</p>
          ) : (
            <div className="space-y-2.5">
              {topAgents.map((a) => (
                <div
                  key={`${a.name}-${a.client}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-creme truncate">{a.name}</div>
                    <div className="text-[11.5px] text-creme-faint truncate">{a.client}</div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-[13px] font-mono text-brand-bright">{a.count}</div>
                    <div className="text-[11px] font-mono text-semantic-red">${a.cost.toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Card KPI reutilizável ─────────────────────────────────────────────────

type Accent = 'brand' | 'green' | 'amber' | 'muted' | 'danger';

const ACCENT_BG: Record<Accent, string> = {
  brand: 'from-brand/15 to-brand/5 border-brand/20',
  green: 'from-semantic-green/10 to-transparent border-semantic-green/20',
  amber: 'from-semantic-amber/10 to-transparent border-semantic-amber/20',
  muted: 'from-surface-3 to-surface-2 border-default',
  danger: 'from-semantic-red/12 to-semantic-red/4 border-semantic-red/30',
};

const ACCENT_ICON: Record<Accent, string> = {
  brand: 'bg-brand/15 text-brand-bright',
  green: 'bg-semantic-green/10 text-semantic-green',
  amber: 'bg-semantic-amber/10 text-semantic-amber',
  muted: 'bg-surface-3 text-creme-mute',
  danger: 'bg-semantic-red/15 text-semantic-red',
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
  delta,
  deltaContext,
  isCostMetric = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: Accent;
  /** Variação % vs período anterior. null = sem dados pra comparar. */
  delta?: number | null;
  deltaContext?: string;
  /** Pra custo: ↑ é ruim (vermelho), ↓ é bom (verde). Inverte cores. */
  isCostMetric?: boolean;
}) {
  const valueColor = accent === 'danger' ? 'text-semantic-red' : 'text-creme';

  // Cor do delta: pra custo (isCostMetric), ↑ é ruim (vermelho), ↓ é bom (verde).
  // Pra outras métricas, ↑ é bom (verde), ↓ é ruim (vermelho).
  const deltaIsBad = delta !== null && delta !== undefined
    ? (isCostMetric ? delta > 0 : delta < 0)
    : false;
  const deltaColor = delta === null || delta === undefined
    ? ''
    : deltaIsBad
      ? 'text-semantic-red'
      : 'text-semantic-green';
  const DeltaIcon = delta !== null && delta !== undefined && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div className={`bg-gradient-to-br ${ACCENT_BG[accent]} border rounded-[10px] p-4 transition-all hover:border-hover hover:shadow-[0_0_20px_rgba(107,143,94,0.08)]`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${ACCENT_ICON[accent]}`}>
          {icon}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-creme-faint font-bold">
          {label}
        </span>
      </div>
      <div className={`text-[26px] font-extrabold ${valueColor} tracking-tight font-mono leading-none mb-1`}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-creme-faint">{sub}</div>}
      {delta !== null && delta !== undefined && (
        <div className={`flex items-center gap-1 mt-1.5 text-[11.5px] font-mono font-semibold ${deltaColor}`}>
          <DeltaIcon size={11} />
          <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
          {deltaContext && <span className="text-creme-faint font-normal">{deltaContext}</span>}
        </div>
      )}
    </div>
  );
}
