import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Bot, MessageSquare, CheckCircle, ArrowUpRight, ChevronRight,
  AlertTriangle, Users, Activity, Shield, Calendar, Check, X,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import type { Agent, ExecutionStatus } from '@/types';

const STATUS_CONFIG: Record<ExecutionStatus, { icon: typeof Check; label: string; color: string }> = {
  resolved: { icon: Check, label: 'Resolvido', color: 'text-semantic-green' },
  escalated: { icon: ArrowUpRight, label: 'Escalado', color: 'text-semantic-amber' },
  failed: { icon: X, label: 'Falha', color: 'text-semantic-red' },
  running: { icon: Activity, label: 'Executando', color: 'text-semantic-blue' },
};

export function DashboardPage() {
  const { agents, metrics, escalations, executions } = useAppStore();
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const metricCards = [
    { icon: Bot, label: 'Colaboradores Ativos', value: metrics?.activeAgents ?? 0, trend: metrics?.trends.agents ?? 0, style: 'bg-brand/10 text-brand-bright' },
    { icon: MessageSquare, label: 'Atendimentos Hoje', value: metrics?.totalToday ?? 0, trend: metrics?.trends.conversations ?? 0, style: 'bg-semantic-blue/10 text-semantic-blue' },
    { icon: CheckCircle, label: 'Taxa de Resolução', value: `${metrics?.resolutionRate ?? 0}%`, trend: metrics?.trends.resolution ?? 0, style: 'bg-semantic-green/10 text-semantic-green' },
    { icon: ArrowUpRight, label: 'Escalamentos Hoje', value: metrics?.escalationsToday ?? 0, trend: metrics?.trends.escalations ?? 0, style: 'bg-semantic-amber/10 text-semantic-amber' },
  ];

  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {metricCards.map((m) => {
          const Icon = m.icon;
          const isNeg = typeof m.trend === 'number' && m.trend < 0;
          return (
            <div key={m.label} className="bg-surface-2 border border-default rounded-[10px] p-5 hover:border-hover transition-all">
              <div className="flex items-start justify-between mb-3.5">
                <div className={clsx('w-[34px] h-[34px] rounded-lg flex items-center justify-center', m.style)}>
                  <Icon size={16} />
                </div>
                <span className={clsx(
                  'text-[13px] font-mono font-medium px-1.5 py-0.5 rounded-full',
                  m.label === 'Escalamentos Hoje'
                    ? (isNeg ? 'bg-semantic-green/10 text-semantic-green' : 'bg-semantic-red/10 text-semantic-red')
                    : (isNeg ? 'bg-semantic-red/10 text-semantic-red' : 'bg-semantic-green/10 text-semantic-green'),
                )}>
                  {isNeg ? '' : '+'}{m.trend}{typeof m.trend === 'number' && m.label !== 'Colaboradores Ativos' ? '%' : ''}
                </span>
              </div>
              <div className="text-[28px] font-extrabold text-creme tracking-tight leading-none mb-1">{m.value}</div>
              <div className="text-[13.5px] text-creme-mute font-medium">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Agents + Escalations */}
      <div className="grid grid-cols-[1fr_360px] gap-4 mb-6">
        <div>
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
            <div className="flex flex-col gap-2.5">
              {agents.map((a) => (
                <AgentCard key={a.id} agent={a} onClick={() => setSelectedAgent(a)} />
              ))}
            </div>
          )}
        </div>

        {/* Escalations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
              <AlertTriangle size={16} className="text-creme-mute" /> Escalamentos Pendentes
            </div>
          </div>
          <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-default flex items-center justify-between">
              <span className="text-xs font-bold text-creme flex items-center gap-1.5">
                <Users size={14} className="text-creme-mute" /> Aguardando Humano
              </span>
              <span className="chip chip-amber">{escalations.length} pendentes</span>
            </div>
            {escalations.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="text-[13px] text-creme-faint">Nenhum escalonamento pendente</p>
              </div>
            )}
            {escalations.map((e) => (
              <div key={e.id} className="px-4 py-3 border-b border-default last:border-b-0 flex items-start gap-2.5 hover:bg-surface-hover transition-colors cursor-pointer">
                <div className="w-7 h-7 rounded-md bg-semantic-amber/10 text-semantic-amber flex items-center justify-center shrink-0">
                  <AlertTriangle size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-creme">{e.customerName}</div>
                  <div className="text-[13px] text-creme-mute truncate">{e.reason}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[12px] font-mono text-creme-faint">{e.waitTime < 60 ? `${e.waitTime} min` : `${Math.floor(e.waitTime / 60)}h ${e.waitTime % 60}m`}</span>
                  <span className="chip chip-amber">{e.agentName.includes('Suporte') ? 'N1' : 'Agend'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Executions table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
            <Activity size={16} className="text-creme-mute" /> Execuções Recentes
          </div>
          <button onClick={() => navigate('/logs')} className="text-[13px] text-creme-mute font-semibold hover:text-brand-bright transition-colors flex items-center gap-1">
            Ver todas <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[2.2fr_1.2fr_.8fr_.7fr_.7fr_.6fr] px-5 py-2.5 bg-surface-1 border-b border-default">
            {['Colaborador', 'Status', 'Tools', 'Tempo', 'Tokens', 'Há'].map((h) => (
              <div key={h} className="text-[12px] font-bold uppercase tracking-wider text-creme-faint">{h}</div>
            ))}
          </div>
          {executions.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-[13.5px] text-creme-mute">Nenhuma execução registrada ainda</p>
              <p className="text-[12.5px] text-creme-faint mt-1">As execuções vão aparecer aqui quando o worker começar a processar mensagens</p>
            </div>
          )}
          {executions.map((e) => {
            const sc = STATUS_CONFIG[e.status];
            const StatusIcon = sc.icon;
            const isSupport = e.agentName.includes('Suporte');
            return (
              <div key={e.id} className="grid grid-cols-[2.2fr_1.2fr_.8fr_.7fr_.7fr_.6fr] px-5 py-3 border-b border-default last:border-b-0 items-center hover:bg-surface-hover transition-colors cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    isSupport ? 'bg-brand/10 text-brand-bright' : 'bg-semantic-blue/10 text-semantic-blue',
                  )}>
                    {isSupport ? <Shield size={13} /> : <Calendar size={13} />}
                  </div>
                  <div>
                    <div className="text-[14.5px] font-semibold text-creme">{e.agentName}</div>
                    <div className="text-[12.5px] text-creme-faint">{e.clientName} · {e.customerName}</div>
                  </div>
                </div>
                <div className={clsx('flex items-center gap-1.5 text-[13.5px] font-semibold', sc.color)}>
                  <StatusIcon size={13} /> {sc.label}
                </div>
                <div className="text-xs font-mono text-brand">{e.toolsUsed.length} tools</div>
                <div className="text-xs font-mono text-creme-dim">{e.responseTime}s</div>
                <div className="text-xs font-mono text-creme-dim">{e.tokensUsed.toLocaleString()}</div>
                <div className="text-[13px] font-mono text-creme-faint">
                  {Math.round((Date.now() - new Date(e.timestamp).getTime()) / 60000)} min
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </>
  );
}
