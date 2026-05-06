import { useMemo } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '@/hooks/useAppStore';

interface Props {
  client: string;
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Lista de ferramentas disponíveis para um colaborador, filtrada por escopo.
 * Mostra apenas ferramentas ativas do cliente do agent + globais.
 */
export function ToolSelector({ client, selected, onChange }: Props) {
  const tools = useAppStore((s) => s.tools);

  const available = useMemo(() => {
    return tools.filter((t) => {
      if (!t.active) return false;
      const scope = t.scope.toLowerCase();
      return scope === 'global' || scope === client.toLowerCase();
    });
  }, [tools, client]);

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((n) => n !== name));
    else onChange([...selected, name]);
  };

  if (available.length === 0) {
    return (
      <div className="text-[13px] text-creme-faint italic px-3 py-3 bg-surface-2 border border-default rounded-lg">
        Nenhuma ferramenta ativa disponível para "{client || '—'}". Cadastre ferramentas com escopo{' '}
        <span className="font-mono">global</span> ou <span className="font-mono">{client || 'cliente'}</span> em{' '}
        <span className="text-creme-mute">Ferramentas</span>.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
      {available.map((t) => {
        const isOn = selected.includes(t.name);
        return (
          <label
            key={t.id}
            className={clsx(
              'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all',
              isOn
                ? 'bg-brand/[0.08] border-brand/40'
                : 'bg-surface-2 border-default hover:border-hover',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={isOn}
              onChange={() => toggle(t.name)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13.5px] font-bold font-mono text-creme">{t.name}</span>
                <span className="chip chip-muted text-[11.5px]">{t.scope}</span>
              </div>
              <div className="text-[12.5px] text-creme-mute leading-snug truncate">{t.description}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
