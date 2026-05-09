import { useMemo } from 'react';
import {
  BarChart3, TrendingUp, Activity, Zap, AlertTriangle,
  Clock, Wrench, Users, DollarSign, CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { resolveCost, usdToBrl } from '@/lib/pricing';
import type { Execution } from '@/types';

/**
 * Métricas — visão analítica dos colaboradores digitais.
 * Calcula tudo em runtime a partir de `executions` (que já são carregadas
 * pelo store no boot). Sem queries adicionais ao Supabase.
 */
export function MetricsPage() {
  const { executions, agents, escalations } = useAppStore();

  const computeCost = (e: Execution): number =>
    resolveCost(e.cost ?? 0, e.tokensUsed, e.model, e.cacheReadTokens ?? 0);

  // ─── Períodos ──────────────────────────────────────────────────────────────
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todayMs = startOfToday.getTime();
  const last7d = now - 7 * day;
  const last30d = now - 30 * day;

  const inToday = (e: Execution) => new Date(e.timestamp).getTime() >= todayMs;
  const in7d = (e: Execution) => new Date(e.timestamp).getTime() >= last7d;
  const in30d = (e: Execution) => new Date(e.timestamp).getTime() >= last30d;

  // ─── KPIs principais ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalToday = executions.filter(inToday).length;
    const total7d = executions.filter(in7d).length;
    const total30d = executions.filter(in30d).length;

    const resolved30d = executions.filter((e) => in30d(e) && e.status === 'resolved').length;
    const escalated30d = executions.filter((e) => in30d(e) && e.status === 'escalated').length;
    const failed30d = executions.filter((e) => in30d(e) && e.status === 'failed').length;
    const resolutionRate30d = total30d > 0 ? Math.round((resolved30d / total30d) * 100) : 0;

    const totalTokens30d = executions.filter(in30d).reduce((s, e) => s + e.tokensUsed, 0);
    const totalCost30d = executions.filter(in30d).reduce((s, e) => s + computeCost(e), 0);

    const avgResponseTime = executions.filter(in7d).length > 0
      ? executions.filter(in7d).reduce((s, e) => s + e.responseTime, 0) / executions.filter(in7d).length
      : 0;

    const onlineAgents = agents.filter((a) => a.status === 'online').length;
    const pendingEscalations = escalations.length;

    return {
      totalToday,
      total7d,
      total30d,
      resolved30d,
      escalated30d,
      failed30d,
      resolutionRate30d,
      totalTokens30d,
      totalCost30d,
      avgResponseTime,
      onlineAgents,
      pendingEscalations,
    };
  }, [executions, agents, escalations]);

  // ─── Top tools (últimos 30d) ───────────────────────────────────────────────
  const topTools = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of executions.filter(in30d)) {
      for (const t of e.toolsUsed ?? []) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [executions]);

  // ─── Top agentes por execução (últimos 30d) ────────────────────────────────
  const topAgents = useMemo(() => {
    const counts: Record<string, { name: string; client: string; count: number; cost: number }> = {};
    for (const e of executions.filter(in30d)) {
      const key = e.agentId;
      if (!counts[key]) {
        counts[key] = { name: e.agentName, client: e.clientName, count: 0, cost: 0 };
      }
      counts[key].count++;
      counts[key].cost += computeCost(e);
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [executions]);

  // ─── Distribuição por dia (últimos 7 dias) ─────────────────────────────────
  const last7Days = useMemo(() => {
    const days: Array<{ date: string; label: string; count: number; cost: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + day;
      const dayExecs = executions.filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        return ts >= start && ts < end;
      });
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        count: dayExecs.length,
        cost: dayExecs.reduce((s, e) => s + computeCost(e), 0),
      });
    }
    return days;
  }, [executions]);

  const maxDayCount = Math.max(...last7Days.map((d) => d.count), 1);

  return (
    <>
      <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-4">
        <BarChart3 size={16} className="text-creme-mute" /> Métricas
      </div>

      {/* ─── KPIs hero ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard
          icon={<Activity size={14} />}
          label="Atendimentos Hoje"
          value={stats.totalToday}
          accent="brand"
          sub={`${stats.total7d} nos últimos 7d`}
        />
        <KpiCard
          icon={<CheckCircle2 size={14} />}
          label="Taxa de Resolução (30d)"
          value={`${stats.resolutionRate30d}%`}
          accent="green"
          sub={`${stats.resolved30d}/${stats.total30d} resolvidos`}
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label="Escalações Pendentes"
          value={stats.pendingEscalations}
          accent={stats.pendingEscalations > 0 ? 'amber' : 'muted'}
          sub={`${stats.escalated30d} escaladas em 30d`}
        />
        <KpiCard
          icon={<DollarSign size={14} />}
          label="Custo LLM (30d)"
          value={`$${stats.totalCost30d.toFixed(2)}`}
          accent="brand"
          sub={`≈ R$ ${usdToBrl(stats.totalCost30d).toFixed(2)}`}
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
          icon={<Clock size={14} />}
          label="Tempo Médio Resposta"
          value={`${stats.avgResponseTime.toFixed(1)}s`}
          accent="brand"
          sub="Últimos 7d"
        />
        <KpiCard
          icon={<Zap size={14} />}
          label="Tokens (30d)"
          value={(stats.totalTokens30d / 1000).toFixed(1) + 'k'}
          accent="muted"
          sub="Input + output combinados"
        />
      </div>

      {/* ─── Gráfico simples — atendimentos por dia ─────────────────────── */}
      <div className="bg-surface-2 border border-default rounded-[10px] p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-brand" />
            <h3 className="text-[14px] font-bold text-creme">Atendimentos por dia</h3>
          </div>
          <span className="text-[12px] text-creme-faint font-mono">Últimos 7 dias</span>
        </div>
        <div className="flex items-end gap-3 h-[120px]">
          {last7Days.map((d) => {
            const heightPct = (d.count / maxDayCount) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
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
                <div className="text-[11px] text-creme-mute font-mono">{d.label}</div>
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
            <h3 className="text-[14px] font-bold text-creme">Tools mais usadas (30d)</h3>
          </div>
          {topTools.length === 0 ? (
            <p className="text-[13px] text-creme-faint italic">Nenhuma tool executada ainda.</p>
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
            <h3 className="text-[14px] font-bold text-creme">Top colaboradores (30d)</h3>
          </div>
          {topAgents.length === 0 ? (
            <p className="text-[13px] text-creme-faint italic">Nenhum colaborador ativo ainda.</p>
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
                    <div className="text-[11px] font-mono text-creme-faint">${a.cost.toFixed(3)}</div>
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

type Accent = 'brand' | 'green' | 'amber' | 'muted';

const ACCENT_BG: Record<Accent, string> = {
  brand: 'from-brand/15 to-brand/5 border-brand/20',
  green: 'from-semantic-green/10 to-transparent border-semantic-green/20',
  amber: 'from-semantic-amber/10 to-transparent border-semantic-amber/20',
  muted: 'from-surface-3 to-surface-2 border-default',
};

const ACCENT_ICON: Record<Accent, string> = {
  brand: 'bg-brand/15 text-brand-bright',
  green: 'bg-semantic-green/10 text-semantic-green',
  amber: 'bg-semantic-amber/10 text-semantic-amber',
  muted: 'bg-surface-3 text-creme-mute',
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: Accent;
}) {
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
      <div className="text-[26px] font-extrabold text-creme tracking-tight font-mono leading-none mb-1">
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-creme-faint">{sub}</div>}
    </div>
  );
}
