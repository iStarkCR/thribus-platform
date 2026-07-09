import { clsx } from 'clsx';
import { Crown, Settings, Radio } from 'lucide-react';
import type { Agent } from '@/types';
import { useAppStore } from '@/hooks/useAppStore';

interface AgentCardProps {
  agent: Agent;
  showFullInfo?: boolean;
  /** Cor de accent (do setor) — barra lateral. Supervisor sempre usa dourado. */
  accent?: string;
  /** Clique no card — por padrão abre o chat com o colaborador. */
  onClick: () => void;
  /** Engrenagem — abre a configuração do colaborador. */
  onConfig?: () => void;
}

const STATUS = {
  online: { label: 'Online', dot: 'bg-semantic-green', text: 'text-semantic-green', pulse: true },
  standby: { label: 'Standby', dot: 'bg-semantic-amber', text: 'text-semantic-amber', pulse: false },
  offline: { label: 'Offline', dot: 'bg-creme-faint', text: 'text-creme-faint', pulse: false },
} as const;

export function AgentCard({ agent, showFullInfo, accent, onClick, onConfig }: AgentCardProps) {
  const toggleAgent = useAppStore((s) => s.toggleAgent);
  const off = agent.status !== 'online';
  const sup = agent.isSupervisor;
  // Accent: supervisor = dourado; senão a cor do setor; fallback sage.
  const ink = sup ? 'rgb(var(--gold-bright))' : accent || 'rgb(var(--brand-bright))';
  const tint = sup ? 'rgb(var(--gold-bright) / 0.14)' : accent ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'rgb(var(--brand) / 0.14)';
  const st = STATUS[agent.status as keyof typeof STATUS] ?? STATUS.offline;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group glass-panel relative overflow-hidden bg-surface-2 border border-default rounded-2xl p-4 pl-5 cursor-pointer',
        'transition-all duration-200 hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-26px_rgba(0,0,0,0.65)]',
        off && 'opacity-55 hover:opacity-80',
        sup && 'shadow-[0_18px_44px_-28px_rgba(198,164,90,0.45)]',
      )}
    >
      {/* Barra de accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${ink}, ${ink} 30%, transparent)` }} />

      {/* Topo: avatar + nome + status/ações */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[16px] font-bold shrink-0 ring-1"
            style={{ background: tint, color: ink, boxShadow: `inset 0 0 0 1px ${tint}`, ['--tw-ring-color' as string]: tint }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className={clsx('flex items-center gap-1.5 text-[15px] font-bold tracking-tight truncate', off ? 'text-creme-faint' : 'text-creme')}>
              <span className="truncate">{agent.name}{showFullInfo ? ` — ${agent.client}` : ''}</span>
              {sup && <Crown size={13} className="text-gold-bright shrink-0" />}
            </div>
            <div className="text-[12.5px] text-creme-mute truncate mt-0.5">
              {showFullInfo ? `Colaborador Digital ${agent.type.charAt(0).toUpperCase() + agent.type.slice(1)} · ${agent.sector}` : `${agent.client} · ${agent.sector}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {sup && (
            <span className="hidden sm:inline-block text-[9.5px] font-bold uppercase tracking-wider bg-gold/12 text-gold-bright border border-gold/30 px-2 py-0.5 rounded-full">Supervisor</span>
          )}
          <div className={clsx('flex items-center gap-1.5 text-[12px] font-semibold', st.text)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', st.dot, st.pulse && 'animate-pulse-dot')} />
            <span className="hidden md:inline">{st.label}</span>
          </div>
          {onConfig && (
            <button onClick={(e) => { e.stopPropagation(); onConfig(); }} className="text-creme-faint hover:text-creme p-1 -m-1 transition-colors" title="Configurar colaborador">
              <Settings size={15} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleAgent(agent.id); }}
            className={clsx('w-[34px] h-5 rounded-full relative transition-all duration-150 shrink-0', agent.status === 'online' ? 'bg-brand/30 border border-brand' : 'bg-surface-0 border border-default')}
            title={agent.status === 'online' ? 'Desligar' : 'Ligar'}
          >
            <span className={clsx('absolute top-[3px] w-3 h-3 rounded-full transition-all duration-150', agent.status === 'online' ? 'left-[calc(100%-15px)] bg-brand-bright shadow-[0_0_6px_rgba(138,186,122,0.5)]' : 'left-[3px] bg-creme-faint')} />
          </button>
        </div>
      </div>

      {/* Tags (skills) */}
      {agent.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {agent.tools.slice(0, 5).map((tool) => (
            <span key={tool} className={clsx('text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border', off ? 'bg-creme/[0.02] border-default text-creme-faint' : 'bg-brand/[0.07] border-brand/15 text-brand-bright/90')}>{tool}</span>
          ))}
          {agent.tools.length > 5 && <span className="text-[11px] font-mono text-creme-faint px-1 py-0.5">+{agent.tools.length - 5}</span>}
        </div>
      )}

      {/* Canais — visibilidade da dedup (um canal só pode estar em 1 colaborador) */}
      {(agent.channels?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
          <Radio size={12} className="text-creme-faint shrink-0" />
          {agent.channels!.slice(0, 3).map((ch) => (
            <span
              key={ch}
              className={clsx(
                'text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border',
                off ? 'bg-creme/[0.02] border-default text-creme-faint' : 'bg-surface-3 border-default text-creme-mute',
              )}
            >
              {ch}
            </span>
          ))}
          {agent.channels!.length > 3 && (
            <span className="text-[11px] font-mono text-creme-faint px-1 py-0.5">+{agent.channels!.length - 3}</span>
          )}
        </div>
      )}

      {/* Stats — números grandes com accent */}
      <div className="grid grid-cols-4 gap-1 pt-3 border-t border-default/60">
        {[
          { label: 'Demandas', value: agent.stats.total || agent.stats.today || 0 },
          { label: 'Hoje', value: agent.stats.today || 0 },
          { label: 'Resp', value: agent.stats.avgResponseTime ? `${agent.stats.avgResponseTime}s` : null },
          { label: 'Escalados', value: agent.stats.escalated || 0 },
        ].map((s) => {
          const has = s.value !== null && s.value !== 0 && s.value !== '0';
          return (
            <div key={s.label} className="text-center">
              <div className="font-mono text-[18px] font-bold leading-none tabular-nums" style={{ color: has && !off ? ink : 'rgb(var(--creme-faint))' }}>
                {s.value === null || s.value === 0 ? '—' : s.value}
              </div>
              <div className="text-[10px] text-creme-faint uppercase tracking-[0.08em] font-semibold mt-1.5">{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
