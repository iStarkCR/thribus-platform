import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

/**
 * Seletor de conta (estilo Talki "Alterar conta"). Troca a conta ativa e
 * re-escopa o painel inteiro pros dados/colaboradores daquele workspace.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}
function providerLabel(p?: string): string {
  if (p === 'anthropic') return 'Claude';
  if (p === 'openai') return 'OpenAI';
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
}

export function WorkspaceSwitcher() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  if (workspaces.length === 0) return null;
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <div ref={ref} className="relative px-2.5 pt-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'glass-panel w-full flex items-center gap-2.5 pl-1.5 pr-2.5 py-1.5 rounded-2xl border transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_-16px_rgba(0,0,0,0.5)]',
          open ? 'bg-surface-hover border-brand/40' : 'bg-surface-2/80 border-default hover:border-brand/40',
        )}
      >
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-dim to-brand text-white flex items-center justify-center text-[12px] font-bold shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          {initials(active.name)}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-creme-faint leading-none">Conta ativa</div>
          <div className="text-[12.5px] font-bold text-creme truncate leading-tight mt-0.5">{active.name}</div>
        </div>
        <ChevronsUpDown size={14} className="text-creme-faint shrink-0" />
      </button>

      {open && (
        <div className="glass-strong absolute left-2.5 right-2.5 mt-1.5 bg-surface-1 border border-default rounded-2xl shadow-2xl overflow-hidden z-50">
          <div className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-creme-faint">
            Alterar conta · {workspaces.length}
          </div>
          <div className="max-h-[46vh] overflow-y-auto px-1.5 pb-1.5 space-y-0.5">
            {workspaces.map((w) => {
              const isActive = w.id === active.id;
              const prov = providerLabel(w.llmProvider);
              return (
                <button
                  key={w.id}
                  onClick={() => { setActiveWorkspace(w.id); setOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition-colors',
                    isActive ? 'bg-brand/12 ring-1 ring-brand/30' : 'hover:bg-surface-hover',
                  )}
                >
                  <span className={clsx(
                    'w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0',
                    isActive ? 'bg-gradient-to-br from-brand-dim to-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]' : 'bg-surface-3 text-creme-mute',
                  )}>
                    {initials(w.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={clsx('text-[13px] font-semibold truncate', isActive ? 'text-creme' : 'text-creme-dim')}>{w.name}</div>
                    {prov && <div className="text-[10.5px] text-creme-faint truncate">{prov}</div>}
                  </div>
                  {isActive && <Check size={15} className="text-brand-bright shrink-0" />}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/clients'); }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-semibold text-brand-bright hover:bg-surface-hover border-t border-default transition-colors"
          >
            <span className="w-7 h-7 rounded-xl bg-brand/12 flex items-center justify-center shrink-0"><Plus size={15} /></span>
            Adicionar / gerenciar contas
          </button>
        </div>
      )}
    </div>
  );
}
