import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

/**
 * Seletor de conta (estilo Talki "Alterar conta"). Troca a conta ativa e
 * re-escopa o painel inteiro pros dados/colaboradores daquele workspace.
 */
export function WorkspaceSwitcher() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
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
          'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors',
          open ? 'bg-surface-hover border-hover' : 'bg-surface-2 border-default hover:bg-surface-hover',
        )}
      >
        <div className="w-6 h-6 rounded-md bg-brand/15 text-brand flex items-center justify-center shrink-0">
          <Building2 size={13} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-creme-faint leading-none">Conta</div>
          <div className="text-[12.5px] font-semibold text-creme truncate leading-tight mt-0.5">{active?.name}</div>
        </div>
        <ChevronsUpDown size={14} className="text-creme-faint shrink-0" />
      </button>

      {open && (
        <div className="absolute left-2.5 right-2.5 mt-1 bg-surface-1 border border-default rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-creme-faint border-b border-default">
            Alterar conta
          </div>
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {workspaces.map((w) => {
              const isActive = w.id === active?.id;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    setActiveWorkspace(w.id);
                    setOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                    isActive ? 'bg-brand/10' : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="flex-1 min-w-0 text-[12.5px] text-creme truncate">{w.name}</span>
                  {isActive && <Check size={13} className="text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
