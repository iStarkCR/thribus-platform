import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Terminal, Check, X, ArrowUpRight, Activity, Filter, Search,
  Shield, Calendar, ChevronDown,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { resolveCost } from '@/lib/pricing';
import type { Execution, ExecutionStatus } from '@/types';

const STATUS_CONFIG: Record<ExecutionStatus, {
  icon: typeof Check;
  label: string;
  color: string;
  bg: string;
  /** Borda esquerda colorida (4px) — sinaliza importância da row no scan visual */
  borderLeft: string;
  /** Background tonal sutil aplicado na row inteira */
  rowBg: string;
}> = {
  resolved: {
    icon: Check, label: 'Resolvido',
    color: 'text-semantic-green', bg: 'bg-semantic-green/10',
    borderLeft: 'border-l-semantic-green', rowBg: 'hover:bg-semantic-green/[0.04]',
  },
  escalated: {
    icon: ArrowUpRight, label: 'Escalado',
    color: 'text-semantic-amber', bg: 'bg-semantic-amber/10',
    borderLeft: 'border-l-semantic-amber', rowBg: 'bg-semantic-amber/[0.03] hover:bg-semantic-amber/[0.07]',
  },
  failed: {
    icon: X, label: 'Falha',
    color: 'text-semantic-red', bg: 'bg-semantic-red/10',
    borderLeft: 'border-l-semantic-red', rowBg: 'bg-semantic-red/[0.04] hover:bg-semantic-red/[0.08]',
  },
  running: {
    icon: Activity, label: 'Executando',
    color: 'text-semantic-blue', bg: 'bg-semantic-blue/10',
    borderLeft: 'border-l-semantic-blue', rowBg: 'bg-semantic-blue/[0.03] hover:bg-semantic-blue/[0.07]',
  },
};

/** Formata timestamp como "HH:mm" se hoje, "DD/MM HH:mm" se outro dia. */
function formatLogTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate()
    && d.getMonth() === now.getMonth()
    && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function shortModel(model: string | undefined): string {
  if (!model) return '—';
  // claude-sonnet-4-5-20250929 → sonnet-4-5
  // claude-haiku-4-5-20251001 → haiku-4-5
  // claude-opus-4-7 → opus-4-7
  // gpt-4o-mini → gpt-4o-mini
  if (model.startsWith('claude-')) {
    const parts = model.split('-');
    // claude-{family}-{ver}-{ver}-{date?}
    return parts.slice(1, 4).join('-');
  }
  return model;
}

type StatusFilter = 'all' | ExecutionStatus;

export function LogsPage() {
  const { executions, agents } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return executions.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (agentFilter !== 'all' && e.agentId !== agentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.agentName.toLowerCase().includes(q) ||
          e.customerName.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          e.toolsUsed.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [executions, statusFilter, agentFilter, search]);

  const counts = useMemo(() => {
    return {
      all: executions.length,
      resolved: executions.filter((e) => e.status === 'resolved').length,
      escalated: executions.filter((e) => e.status === 'escalated').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running').length,
    };
  }, [executions]);

  const computeCost = (e: Execution): number =>
    resolveCost(e.cost ?? 0, e.tokensUsed, e.model, e.cacheReadTokens ?? 0);

  const totalTokens = filtered.reduce((sum, e) => sum + e.tokensUsed, 0);
  const totalCost = filtered.reduce((sum, e) => sum + computeCost(e), 0);
  const avgTime =
    filtered.length > 0
      ? filtered.reduce((sum, e) => sum + e.responseTime, 0) / filtered.length
      : 0;

  return (
    <>
      <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-4">
        <Terminal size={16} className="text-creme-mute" /> Logs de Execução
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="text-[12px] uppercase tracking-wider text-creme-faint font-bold mb-1">
            Execuções Filtradas
          </div>
          <div className="text-[24px] font-extrabold text-creme tracking-tight font-mono">
            {filtered.length}
          </div>
        </div>
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="text-[12px] uppercase tracking-wider text-creme-faint font-bold mb-1">
            Tempo Médio
          </div>
          <div className="text-[24px] font-extrabold text-creme tracking-tight font-mono">
            {avgTime.toFixed(1)}<span className="text-[14px] text-creme-mute">s</span>
          </div>
        </div>
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="text-[12px] uppercase tracking-wider text-creme-faint font-bold mb-1">
            Tokens Totais
          </div>
          <div className="text-[24px] font-extrabold text-creme tracking-tight font-mono">
            {(totalTokens / 1000).toFixed(1)}<span className="text-[14px] text-creme-mute">k</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-semantic-red/12 to-semantic-red/4 border border-semantic-red/30 rounded-[10px] p-4">
          <div className="text-[12px] uppercase tracking-wider text-creme-faint font-bold mb-1">
            Custo Total
          </div>
          <div className="text-[24px] font-extrabold text-semantic-red tracking-tight font-mono">
            $<span>{totalCost.toFixed(4)}</span>
          </div>
          <div className="text-[10px] text-creme-faint mt-1">
            ≈ R$ {(totalCost * 5).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por colaborador, cliente, ferramenta..."
              className="input pl-9"
            />
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={13} className="text-creme-faint" />
            {(['all', 'resolved', 'escalated', 'failed', 'running'] as StatusFilter[]).map((s) => {
              const active = statusFilter === s;
              const label =
                s === 'all' ? 'Todos' : STATUS_CONFIG[s as ExecutionStatus].label;
              const count = counts[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-all border',
                    active
                      ? 'bg-brand/10 text-brand-bright border-brand'
                      : 'bg-surface-3 text-creme-mute border-default hover:border-hover hover:text-creme-dim',
                  )}
                >
                  {label}
                  <span className="font-mono text-[12px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Agent select */}
          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="appearance-none input pr-8 cursor-pointer min-w-[180px]"
            >
              <option value="all">Todos os colaboradores</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.client}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-creme-faint pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table — colunas: Colaborador, Status, Modelo, Tools, Tempo, Tokens, Cache, Custo, Quando */}
      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[2fr_1.1fr_.9fr_.6fr_.6fr_.7fr_.6fr_.7fr_.7fr] px-5 py-2.5 bg-surface-1 border-b border-default border-l-4 border-l-transparent">
          {['Colaborador', 'Status', 'Modelo', 'Tools', 'Tempo', 'Tokens', 'Cache', 'Custo', 'Quando'].map((h) => (
            <div key={h} className="text-[11.5px] font-bold uppercase tracking-wider text-creme-faint">
              {h}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-3">
              <Terminal size={18} className="text-creme-faint" />
            </div>
            <p className="text-sm text-creme-mute">Nenhuma execução encontrada com os filtros atuais</p>
          </div>
        )}

        {filtered.map((e) => {
          const sc = STATUS_CONFIG[e.status];
          const StatusIcon = sc.icon;
          const isSupport = e.agentName.includes('Suporte');
          const cacheTokens = e.cacheReadTokens ?? 0;
          const hasCache = cacheTokens > 0;
          return (
            <div
              key={e.id}
              className={clsx(
                'grid grid-cols-[2fr_1.1fr_.9fr_.6fr_.6fr_.7fr_.6fr_.7fr_.7fr] px-5 py-3 border-b border-default last:border-b-0 items-center transition-colors border-l-4',
                sc.borderLeft,
                sc.rowBg,
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    isSupport ? 'bg-brand/10 text-brand-bright' : 'bg-semantic-blue/10 text-semantic-blue',
                  )}
                >
                  {isSupport ? <Shield size={13} /> : <Calendar size={13} />}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-creme truncate">
                    {e.agentName}
                  </div>
                  <div className="text-[12px] text-creme-faint truncate">
                    {e.clientName} · {e.customerName}
                  </div>
                </div>
              </div>
              <div className={clsx('flex items-center gap-1.5 text-[13px] font-semibold', sc.color)}>
                <span className={clsx('w-6 h-6 rounded-md flex items-center justify-center', sc.bg)}>
                  <StatusIcon size={12} />
                </span>
                {sc.label}
              </div>
              <div className="text-[11.5px] font-mono text-creme-dim truncate" title={e.model || '—'}>
                {shortModel(e.model)}
              </div>
              <div className="text-xs font-mono text-brand">
                {e.toolsUsed.length > 0 ? `${e.toolsUsed.length}` : '—'}
              </div>
              <div className="text-xs font-mono text-creme-dim">{e.responseTime}s</div>
              <div className="text-xs font-mono text-creme-dim">{e.tokensUsed.toLocaleString()}</div>
              <div
                className={clsx(
                  'text-xs font-mono',
                  hasCache ? 'text-semantic-green' : 'text-creme-faint',
                )}
                title={hasCache ? `${cacheTokens.toLocaleString()} tokens lidos do cache` : 'Sem cache hit'}
              >
                {hasCache ? `${(cacheTokens / 1000).toFixed(1)}k` : '—'}
              </div>
              <div className="text-xs font-mono text-creme-dim">${computeCost(e).toFixed(4)}</div>
              <div className="text-[12px] font-mono text-creme-faint" title={new Date(e.timestamp).toLocaleString('pt-BR')}>
                {formatLogTime(e.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
