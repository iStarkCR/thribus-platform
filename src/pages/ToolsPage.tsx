import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Wrench, Plus, Users, FileText, Wifi, Zap, Server, Calendar, MessageSquare, Pencil } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { ToolModal } from '@/components/tools/ToolModal';
import type { Tool } from '@/types';

const ICON_MAP: Record<string, typeof Users> = {
  users: Users, clipboard: FileText, wifi: Wifi, zap: Zap,
  server: Server, calendar: Calendar, chat: MessageSquare,
};

function getToolIcon(name: string) {
  if (name.includes('cliente') || name.includes('humano')) return 'users';
  if (name.includes('contrato') || name.includes('os')) return 'clipboard';
  if (name.includes('onu') || name.includes('acs')) return 'wifi';
  if (name.includes('reiniciar')) return 'zap';
  if (name.includes('agenda') || name.includes('agendamento')) return 'calendar';
  if (name.includes('confirmacao')) return 'chat';
  return 'server';
}

export function ToolsPage() {
  const tools = useAppStore((s) => s.tools);
  const toggleTool = useAppStore((s) => s.toggleTool);
  const [filter, setFilter] = useState('Todas');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);

  const scopes = useMemo(() => {
    const unique = [...new Set(tools.map((t) => t.scope))];
    return ['Todas', ...unique];
  }, [tools]);

  const filtered = filter === 'Todas' ? tools : tools.filter((t) => t.scope === filter);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Wrench size={16} className="text-creme-mute" /> Ferramentas Disponíveis
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>
          <Plus size={13} /> Nova Ferramenta
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 mb-4 bg-surface-1 border border-default rounded-lg p-0.5 w-fit">
        {scopes.map((s) => {
          const count = s === 'Todas' ? tools.length : tools.filter((t) => t.scope === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all',
                filter === s ? 'bg-surface-3 text-creme' : 'text-creme-mute hover:text-creme-dim',
              )}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {tools.length === 0 && (
        <div className="bg-surface-2 border border-default rounded-[10px] px-12 py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-4">
            <Wrench size={22} className="text-creme-faint" />
          </div>
          <p className="text-sm text-creme font-semibold mb-1">Nenhuma ferramenta cadastrada</p>
          <p className="text-[13.5px] text-creme-mute mb-5">
            Cadastre os endpoints HTTP que seus colaboradores poderão invocar (CRM, ERP, APIs internas).
          </p>
          <button className="btn btn-accent mx-auto" onClick={() => setShowNew(true)}>
            <Plus size={13} /> Criar primeira ferramenta
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 gap-2.5">
        {filtered.map((t) => {
          const iconKey = getToolIcon(t.name);
          const Icon = ICON_MAP[iconKey] || Server;
          return (
            <div
              key={t.id}
              className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all group"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand/[0.08] text-brand flex items-center justify-center">
                  <Icon size={15} />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditing(t)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-creme-faint hover:text-creme p-1"
                    title="Editar"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => toggleTool(t.id)}
                    title={t.active ? 'Desativar' : 'Ativar'}
                    className={clsx(
                      'w-[30px] h-[18px] rounded-full relative transition-all shrink-0',
                      t.active
                        ? 'bg-brand/30 border border-brand'
                        : 'bg-surface-0 border border-default',
                    )}
                  >
                    <span
                      className={clsx(
                        'absolute top-[2px] w-[10px] h-[10px] rounded-full transition-all',
                        t.active
                          ? 'left-[calc(100%-13px)] bg-brand-bright shadow-[0_0_4px_rgba(138,186,122,0.5)]'
                          : 'left-[3px] bg-creme-faint',
                      )}
                    />
                  </button>
                </div>
              </div>
              <div
                className="text-xs font-bold font-mono text-creme mb-1 cursor-pointer"
                onClick={() => setEditing(t)}
              >
                {t.name}
              </div>
              <div className="text-[13px] text-creme-mute leading-relaxed mb-2.5">{t.description}</div>
              <div className="flex items-center justify-between text-[12px] font-mono text-creme-faint">
                <span>{t.endpoint}</span>
                <span className="chip chip-muted">{t.scope}</span>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <ToolModal onClose={() => setShowNew(false)} />}
      {editing && <ToolModal tool={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
