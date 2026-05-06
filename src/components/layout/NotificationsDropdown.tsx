import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, Check, X, Activity, Bell, ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { ExecutionStatus } from '@/types';

interface Props {
  onClose: () => void;
}

const STATUS_ICONS: Record<ExecutionStatus, { icon: typeof Check; color: string }> = {
  resolved: { icon: Check, color: 'text-semantic-green' },
  escalated: { icon: ArrowUpRight, color: 'text-semantic-amber' },
  failed: { icon: X, color: 'text-semantic-red' },
  running: { icon: Activity, color: 'text-semantic-blue' },
};

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export function NotificationsDropdown({ onClose }: Props) {
  const { escalations, executions } = useAppStore();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Fecha em ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const recentFailed = executions.filter((e) => e.status === 'failed').slice(0, 3);
  const recentEscalated = executions.filter((e) => e.status === 'escalated').slice(0, 3);

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+8px)] right-0 w-[380px] max-h-[560px] bg-surface-1 border border-hover rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 flex flex-col animate-modal-in"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-default flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-brand" />
          <span className="text-sm font-bold text-creme">Lembretes & Atividades</span>
        </div>
        <span className="chip chip-muted">
          {escalations.length + recentFailed.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Escalations pendentes */}
        {escalations.length > 0 && (
          <div>
            <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wider text-semantic-amber">
                Aguardando humano
              </span>
              <span className="text-[12px] font-mono text-creme-faint">
                {escalations.length}
              </span>
            </div>
            {escalations.slice(0, 4).map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  navigate('/');
                  onClose();
                }}
                className="w-full px-4 py-2.5 hover:bg-surface-hover transition-colors flex items-start gap-2.5 text-left"
              >
                <div className="w-7 h-7 rounded-md bg-semantic-amber/10 text-semantic-amber flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-creme truncate">
                    {e.customerName}
                  </div>
                  <div className="text-[12.5px] text-creme-mute truncate">{e.reason}</div>
                  <div className="text-[12px] text-creme-faint mt-0.5">
                    {e.agentName} · há {timeAgo(e.timestamp)}
                  </div>
                </div>
                <span
                  className={`chip ${
                    e.priority === 'critical' || e.priority === 'high'
                      ? 'chip-red'
                      : 'chip-amber'
                  } shrink-0`}
                >
                  {e.priority === 'critical' ? 'crítico' : e.priority}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Falhas recentes */}
        {recentFailed.length > 0 && (
          <div className="border-t border-default">
            <div className="px-4 pt-3 pb-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wider text-semantic-red">
                Execuções com falha
              </span>
            </div>
            {recentFailed.map((e) => {
              const sc = STATUS_ICONS[e.status];
              const Icon = sc.icon;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    navigate('/logs');
                    onClose();
                  }}
                  className="w-full px-4 py-2.5 hover:bg-surface-hover transition-colors flex items-start gap-2.5 text-left"
                >
                  <div className={`w-7 h-7 rounded-md bg-semantic-red/10 ${sc.color} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-creme truncate">
                      {e.agentName}
                    </div>
                    <div className="text-[12.5px] text-creme-mute truncate">
                      {e.customerName} · {e.toolsUsed.length} tools
                    </div>
                  </div>
                  <span className="text-[12px] font-mono text-creme-faint shrink-0">
                    {timeAgo(e.timestamp)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Escalações recentes (resolvidas via humano) */}
        {recentEscalated.length > 0 && (
          <div className="border-t border-default">
            <div className="px-4 pt-3 pb-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wider text-creme-mute">
                Escalações recentes
              </span>
            </div>
            {recentEscalated.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  navigate('/logs');
                  onClose();
                }}
                className="w-full px-4 py-2.5 hover:bg-surface-hover transition-colors flex items-start gap-2.5 text-left"
              >
                <div className="w-7 h-7 rounded-md bg-semantic-amber/10 text-semantic-amber flex items-center justify-center shrink-0 mt-0.5">
                  <ArrowUpRight size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-creme truncate">
                    {e.agentName}
                  </div>
                  <div className="text-[12.5px] text-creme-mute truncate">
                    {e.customerName}
                  </div>
                </div>
                <span className="text-[12px] font-mono text-creme-faint shrink-0">
                  {timeAgo(e.timestamp)}
                </span>
              </button>
            ))}
          </div>
        )}

        {escalations.length === 0 && recentFailed.length === 0 && recentEscalated.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-3">
              <Bell size={18} className="text-creme-faint" />
            </div>
            <p className="text-[13.5px] text-creme-mute">Nenhum lembrete pendente</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <button
        onClick={() => {
          navigate('/logs');
          onClose();
        }}
        className="px-4 py-3 border-t border-default flex items-center justify-center gap-1.5 text-[13px] font-semibold text-creme-mute hover:text-brand-bright hover:bg-surface-hover transition-all"
      >
        Ver todas as atividades <ChevronRight size={13} />
      </button>
    </div>
  );
}
