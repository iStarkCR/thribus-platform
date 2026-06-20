import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Bot, MessageSquare, CheckCircle, ArrowUpRight, ChevronRight,
  DollarSign, Clock, Zap, Wrench, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { resolveCost, usdToBrl } from '@/lib/pricing';
import { resolveRange, previousPeriod, inRange, type RangeKey } from '@/lib/dateRanges';
import { DateRangeFilter } from '@/components/shared/DateRangeFilter';
import { MarketingCarousel } from '@/components/shared/MarketingCarousel';
import { CortexBrainShowcase } from '@/components/shared/CortexBrainShowcase';
import type { Agent, Execution } from '@/types';

export function DashboardPage() {
  const { agents, metrics, executions } = useAppStore();
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('today');
  const range = resolveRange(rangeKey);
  const prevRange = previousPeriod(range);

  // ─── Computações em runtime ─────────────────────────────────────────────
  const computeCost = (e: Execution): number =>
    resolveCost(e.cost ?? 0, e.tokensUsed, e.model, e.cacheReadTokens ?? 0);

  const stats = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    const inSel = (e: Execution) => inRange(e.timestamp, range);
    const inPrev = (e: Execution) => inRange(e.timestamp, prevRange);

    const selectedExecs = executions.filter(inSel);
    const prevExecs = executions.filter(inPrev);

    const cost = selectedExecs.reduce((s, e) => s + computeCost(e), 0);
    const prevCost = prevExecs.reduce((s, e) => s + computeCost(e), 0);
    const costDelta = prevCost > 0 ? ((cost - prevCost) / prevCost) * 100 : null;

    const avgResp = selectedExecs.length > 0
      ? selectedExecs.reduce((s, e) => s + e.responseTime, 0) / selectedExecs.length
      : 0;
    const tokens = selectedExecs.reduce((s, e) => s + e.tokensUsed, 0);

    // Top tool no período
    const toolCount: Record<string, number> = {};
    for (const e of selectedExecs) {
      for (const t of e.toolsUsed ?? []) toolCount[t] = (toolCount[t] ?? 0) + 1;
    }
    const topTool = Object.entries(toolCount).sort((a, b) => b[1] - a[1])[0];

    // Sparkline — últimos 7 dias (sempre 7d, independente do filtro principal,
    // pra dar contexto histórico curto)
    const dayBuckets: Array<{ label: string; count: number }> = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + day;
      dayBuckets.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
        count: executions.filter((e) => {
          const ts = new Date(e.timestamp).getTime();
          return ts >= start && ts < end;
        }).length,
      });
    }
    const maxBucket = Math.max(...dayBuckets.map((d) => d.count), 1);

    const lastExecution = executions[0];
    const lastExecutionAgo = lastExecution
      ? Math.round((now - new Date(lastExecution.timestamp).getTime()) / 60000)
      : null;

    return {
      cost, prevCost, costDelta,
      avgResp, tokens,
      topTool, dayBuckets, maxBucket,
      lastExecutionAgo,
      selectedCount: selectedExecs.length,
    };
  }, [executions, range, prevRange]);

  const metricCards = [
    { icon: Bot, label: 'Colaboradores Ativos', value: metrics?.activeAgents ?? 0, trend: metrics?.trends.agents ?? 0, style: 'bg-brand/10 text-brand-bright' },
    { icon: MessageSquare, label: 'Atendimentos Hoje', value: metrics?.totalToday ?? 0, trend: metrics?.trends.conversations ?? 0, style: 'bg-semantic-blue/10 text-semantic-blue' },
    { icon: CheckCircle, label: 'Taxa de Resolução', value: `${metrics?.resolutionRate ?? 0}%`, trend: metrics?.trends.resolution ?? 0, style: 'bg-semantic-green/10 text-semantic-green' },
    { icon: ArrowUpRight, label: 'Escalamentos Hoje', value: metrics?.escalationsToday ?? 0, trend: metrics?.trends.escalations ?? 0, style: 'bg-semantic-amber/10 text-semantic-amber' },
  ];

  return (
    <>
      {/* ─── Marketing carousel ───────────────────────────────────────────── */}
      <div className="mb-4">
        <MarketingCarousel />
      </div>

      {/* ─── Header com filtro temporal ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[15px] font-bold text-creme">
          Visão geral
          <span className="text-[12px] font-normal text-creme-faint ml-2">· {range.label}</span>
        </div>
        <DateRangeFilter value={rangeKey} onChange={setRangeKey} />
      </div>

      {/* ─── KPIs hero (4 cards principais) ───────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        {metricCards.map((m) => {
          const Icon = m.icon;
          const isNeg = typeof m.trend === 'number' && m.trend < 0;
          return (
            <div key={m.label} className="group relative overflow-hidden rounded-2xl border border-default bg-surface-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-hover hover:shadow-[0_20px_44px_-22px_rgba(0,0,0,0.65)]">
              <span className="pointer-events-none absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent" />
              <div className="flex items-start justify-between mb-4">
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105', m.style)}>
                  <Icon size={16} />
                </div>
                <span className={clsx(
                  'text-[12px] font-mono font-semibold px-2 py-0.5 rounded-full',
                  m.label === 'Escalamentos Hoje'
                    ? (isNeg ? 'bg-semantic-green/10 text-semantic-green' : 'bg-semantic-red/10 text-semantic-red')
                    : (isNeg ? 'bg-semantic-red/10 text-semantic-red' : 'bg-semantic-green/10 text-semantic-green'),
                )}>
                  {isNeg ? '' : '+'}{m.trend}{typeof m.trend === 'number' && m.label !== 'Colaboradores Ativos' ? '%' : ''}
                </span>
              </div>
              <div className="text-[30px] font-extrabold text-creme tracking-tight leading-none mb-2">{m.value}</div>
              <div className="text-[11px] text-creme-mute font-semibold uppercase tracking-[0.09em]">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* ─── KPIs operacionais (cards finos) ──────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <CostMicroCard
          label={`Custo · ${range.label}`}
          value={`$${stats.cost.toFixed(stats.cost < 1 ? 3 : 2)}`}
          sub={`R$ ${usdToBrl(stats.cost).toFixed(2)}`}
          delta={stats.costDelta}
          deltaContext={`vs ${prevRange.label.toLowerCase()}`}
        />
        <MicroCard
          icon={<DollarSign size={13} />}
          label="Custo período anterior"
          value={`$${stats.prevCost.toFixed(stats.prevCost < 1 ? 3 : 2)}`}
          sub={prevRange.label}
          color="muted"
        />
        <MicroCard
          icon={<Clock size={13} />}
          label="Tempo médio"
          value={stats.avgResp > 0 ? `${stats.avgResp.toFixed(1)}s` : '—'}
          sub={`${stats.selectedCount} turno${stats.selectedCount !== 1 ? 's' : ''}`}
          color="muted"
        />
        <MicroCard
          icon={<Zap size={13} />}
          label="Tokens"
          value={stats.tokens > 0 ? `${(stats.tokens / 1000).toFixed(1)}k` : '—'}
          sub="input + output"
          color="muted"
        />
        <MicroCard
          icon={<Wrench size={13} />}
          label="Top tool"
          value={stats.topTool ? stats.topTool[0] : '—'}
          sub={stats.topTool ? `${stats.topTool[1]}x` : 'Sem chamadas'}
          color="green"
          mono
        />
      </div>

      {/* ─── Sparkline 7d (sempre 7d pra histórico curto) ──────────────── */}
      <div className="bg-surface-2 border border-default rounded-[10px] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-brand-bright" />
            <h3 className="text-[14px] font-bold text-creme">Atendimentos · últimos 7 dias</h3>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-creme-faint">
            {stats.lastExecutionAgo !== null && (
              <span className="font-mono">
                Último: {stats.lastExecutionAgo < 60 ? `${stats.lastExecutionAgo}min` : `${Math.floor(stats.lastExecutionAgo / 60)}h`} atrás
              </span>
            )}
            <button
              onClick={() => navigate('/analytics')}
              className="font-semibold hover:text-brand-bright transition-colors"
            >
              Ver completo →
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2 h-[80px]">
          {stats.dayBuckets.map((d, i) => {
            const heightPct = (d.count / stats.maxBucket) * 100;
            const isToday = i === stats.dayBuckets.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[10px] font-mono text-creme-faint group-hover:text-creme transition-colors">
                  {d.count}
                </div>
                <div className="w-full bg-surface-1 rounded-t-md flex items-end" style={{ height: '50px' }}>
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      isToday
                        ? 'bg-gradient-to-t from-brand to-brand-bright'
                        : 'bg-gradient-to-t from-brand-dim/50 to-brand-dim/30'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className={`text-[10px] font-mono ${isToday ? 'text-brand-bright font-bold' : 'text-creme-faint'}`}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Colaboradores Digitais (largura cheia) ───────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
            <Bot size={16} className="text-creme-mute" /> Colaboradores Digitais
          </div>
          <button onClick={() => navigate('/agents')} className="text-[13px] text-creme-mute font-semibold hover:text-brand-bright transition-colors flex items-center gap-1">
            Ver todos <ChevronRight size={12} />
          </button>
        </div>
        {agents.length === 0 ? (
          <div className="bg-surface-2 border border-default rounded-[10px] px-8 py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-3">
              <Bot size={20} className="text-creme-faint" />
            </div>
            <p className="text-[13.5px] text-creme-mute mb-3">Ainda não há colaboradores digitais</p>
            <button onClick={() => navigate('/agents')} className="text-[13px] text-brand-bright font-semibold hover:underline">
              Criar primeiro colaborador →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} onClick={() => setSelectedAgent(a)} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Cortex Brain Showcase (pitch + ROI) ─────────────────────── */}
      <div className="mt-6 mb-2">
        <CortexBrainShowcase />
      </div>

      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </>
  );
}

// ─── MicroCard reutilizável ────────────────────────────────────────────────

const MICRO_BG = {
  brand: 'bg-brand/10 text-brand-bright',
  green: 'bg-semantic-green/10 text-semantic-green',
  amber: 'bg-semantic-amber/10 text-semantic-amber',
  muted: 'bg-surface-3 text-creme-mute',
};

function MicroCard({
  icon, label, value, sub, color = 'muted', mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: keyof typeof MICRO_BG;
  mono?: boolean;
}) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3 hover:border-hover transition-all">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-5 h-5 rounded-md flex items-center justify-center ${MICRO_BG[color]}`}>
          {icon}
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-creme-faint font-bold truncate">
          {label}
        </span>
      </div>
      <div className={`text-[18px] font-extrabold text-creme leading-none mb-0.5 ${mono ? 'font-mono text-[14px]' : ''} truncate`}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-creme-faint truncate">{sub}</div>}
    </div>
  );
}

// ─── Card especial pra Custo — vermelho + delta MoM ────────────────────────
function CostMicroCard({
  label, value, sub, delta, deltaContext,
}: {
  label: string;
  value: string;
  sub?: string;
  /** % vs período anterior. null = sem dados pra comparar. */
  delta: number | null;
  deltaContext?: string;
}) {
  // Pra custo: ↑ é ruim (vermelho), ↓ é bom (verde)
  const deltaIsBad = delta !== null && delta > 0;
  const deltaColor = delta === null
    ? ''
    : deltaIsBad
      ? 'text-semantic-red'
      : 'text-semantic-green';
  const DeltaIcon = delta !== null && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="bg-gradient-to-br from-semantic-red/12 to-semantic-red/4 border border-semantic-red/30 rounded-[10px] p-3 hover:border-semantic-red/50 transition-all">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-5 h-5 rounded-md bg-semantic-red/15 text-semantic-red flex items-center justify-center">
          <DollarSign size={13} />
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-creme-faint font-bold truncate">
          {label}
        </span>
      </div>
      <div className="text-[18px] font-extrabold text-semantic-red leading-none mb-0.5 truncate">
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-creme-faint truncate">{sub}</div>}
      {delta !== null && (
        <div className={`flex items-center gap-1 mt-1 text-[10.5px] font-mono font-semibold ${deltaColor}`}>
          <DeltaIcon size={10} />
          <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
          {deltaContext && <span className="text-creme-faint font-normal text-[9.5px] truncate">{deltaContext}</span>}
        </div>
      )}
    </div>
  );
}
