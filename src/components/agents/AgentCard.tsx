import { clsx } from 'clsx';
import { Shield, Calendar, Briefcase } from 'lucide-react';
import type { Agent } from '@/types';
import { useAppStore } from '@/hooks/useAppStore';

const TYPE_ICONS = {
  support: Shield,
  schedule: Calendar,
  sales: Briefcase,
};

const TYPE_STYLES = {
  support: 'bg-brand/10 text-brand-bright border-brand/20',
  schedule: 'bg-semantic-blue/10 text-semantic-blue border-semantic-blue/20',
  sales: 'bg-semantic-amber/10 text-semantic-amber border-semantic-amber/20',
  off: 'bg-white/[0.03] text-creme-faint border-default',
};

function getAgentVisualType(agent: Agent): 'support' | 'schedule' | 'sales' {
  if (agent.sector.includes('Telecom') || agent.sector.includes('ISP')) return 'support';
  if (agent.sector.includes('Saúde')) return 'schedule';
  return 'sales';
}

interface AgentCardProps {
  agent: Agent;
  showFullInfo?: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, showFullInfo, onClick }: AgentCardProps) {
  const toggleAgent = useAppStore((s) => s.toggleAgent);
  const off = agent.status !== 'online';
  const visualType = getAgentVisualType(agent);
  const style = off ? TYPE_STYLES.off : TYPE_STYLES[visualType];
  const Icon = TYPE_ICONS[visualType];

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-surface-2 border border-default rounded-[10px] p-5 transition-all duration-150 cursor-pointer hover:border-hover hover:bg-surface-3',
        off && 'opacity-50 hover:opacity-70',
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-3">
          <div className={clsx('w-[38px] h-[38px] rounded-[9px] flex items-center justify-center border shrink-0', style)}>
            <Icon size={16} />
          </div>
          <div>
            <div className={clsx('text-[15.5px] font-bold tracking-tight', off ? 'text-creme-faint' : 'text-creme')}>
              {agent.name}{showFullInfo ? ` — ${agent.client}` : ''}
            </div>
            <div className="text-[13px] text-creme-mute mt-px">
              {showFullInfo ? `Colaborador Digital ${agent.type.charAt(0).toUpperCase() + agent.type.slice(1)} · ${agent.sector}` : `${agent.client} · ${agent.sector}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status */}
          <div className={clsx('flex items-center gap-1.5 text-[13px] font-semibold', {
            'text-semantic-green': agent.status === 'online',
            'text-semantic-amber': agent.status === 'standby',
            'text-creme-faint': agent.status === 'offline',
          })}>
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', {
              'bg-semantic-green animate-pulse-dot': agent.status === 'online',
              'bg-semantic-amber': agent.status === 'standby',
              'bg-creme-faint': agent.status === 'offline',
            })} />
            {agent.status === 'online' ? 'Online' : agent.status === 'standby' ? 'Standby' : 'Offline'}
          </div>

          {/* Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleAgent(agent.id);
            }}
            className={clsx(
              'w-[34px] h-5 rounded-full relative transition-all duration-150 shrink-0',
              agent.status === 'online'
                ? 'bg-brand/30 border border-brand'
                : 'bg-surface-0 border border-default',
            )}
          >
            <span className={clsx(
              'absolute top-[3px] w-3 h-3 rounded-full transition-all duration-150',
              agent.status === 'online'
                ? 'left-[calc(100%-15px)] bg-brand-bright shadow-[0_0_6px_rgba(138,186,122,0.5)]'
                : 'left-[3px] bg-creme-faint',
            )} />
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3.5">
        {agent.tools.map((tool) => (
          <span key={tool} className={clsx('tag', off && 'tag-off')}>{tool}</span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 pt-3.5 border-t border-default">
        {[
          { label: 'Hoje', value: agent.stats.today || '—' },
          { label: 'Resolução', value: agent.stats.resolution ? `${agent.stats.resolution}%` : '—' },
          { label: 'Resp. Média', value: agent.stats.avgResponseTime ? `${agent.stats.avgResponseTime}s` : '—' },
          { label: 'Escalados', value: agent.stats.escalated || '—' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className={clsx('font-mono text-sm font-semibold', off ? 'text-creme-faint' : 'text-creme')}>
              {stat.value}
            </div>
            <div className="text-[11.5px] text-creme-faint uppercase tracking-wider font-semibold mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
