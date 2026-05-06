import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Wrench, Plus, Users, FileText, Wifi, Zap, Server, Calendar,
  MessageSquare, Pencil, Search, Folder, FolderOpen, ChevronRight,
  Globe,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { ToolModal } from '@/components/tools/ToolModal';
import type { Tool } from '@/types';

const ICON_MAP: Record<string, typeof Users> = {
  users: Users, clipboard: FileText, wifi: Wifi, zap: Zap,
  server: Server, calendar: Calendar, chat: MessageSquare,
};

function getToolIcon(name: string) {
  if (name.includes('cliente') || name.includes('humano') || name.includes('lead')) return 'users';
  if (name.includes('contrato') || name.includes('os') || name.includes('cadastro')) return 'clipboard';
  if (name.includes('onu') || name.includes('acs') || name.includes('viabilidade')) return 'wifi';
  if (name.includes('reiniciar')) return 'zap';
  if (name.includes('agenda') || name.includes('agendamento') || name.includes('vagas')) return 'calendar';
  if (name.includes('confirmacao') || name.includes('mensagem')) return 'chat';
  return 'server';
}

export function ToolsPage() {
  const tools = useAppStore((s) => s.tools);
  const toggleTool = useAppStore((s) => s.toggleTool);

  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (scope: string) => {
    const next = new Set(collapsed);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    setCollapsed(next);
  };

  // Filtra por busca
  const filtered = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.scope.toLowerCase().includes(q) ||
        t.endpoint.toLowerCase().includes(q),
    );
  }, [tools, search]);

  // Agrupa em "pastas" por escopo (case-insensitive). Global pinado no topo.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; tools: Tool[] }>();
    for (const t of filtered) {
      const raw = t.scope || 'global';
      const key = raw.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { name: raw, tools: [] });
      }
      map.get(key)!.tools.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'global') return -1;
      if (b === 'global') return 1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Wrench size={16} className="text-creme-mute" /> Ferramentas Disponíveis
          <span className="ml-2 chip chip-muted">{tools.length}</span>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>
          <Plus size={13} /> Nova Ferramenta
        </button>
      </div>

      {/* Empty state global */}
      {tools.length === 0 ? (
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
      ) : (
        <>
          {/* Busca */}
          <div className="relative mb-4 max-w-[420px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, descrição, endpoint ou cliente..."
              className="input pl-9"
            />
          </div>

          {filtered.length === 0 && (
            <div className="bg-surface-2 border border-default rounded-[10px] px-8 py-12 text-center">
              <p className="text-[13.5px] text-creme-mute">Nenhuma ferramenta corresponde a "{search}"</p>
            </div>
          )}

          {/* Pastas por escopo */}
          <div className="space-y-3">
            {grouped.map(([scopeKey, { name: scopeName, tools: list }]) => {
              const isOpen = !collapsed.has(scopeKey);
              const isGlobal = scopeKey === 'global';
              const FolderIcon = isOpen ? FolderOpen : Folder;
              return (
                <div key={scopeKey} className="bg-surface-1 border border-default rounded-[10px] overflow-hidden">
                  {/* Header — toggle */}
                  <button
                    onClick={() => toggleCollapse(scopeKey)}
                    className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-surface-hover transition-colors"
                  >
                    <ChevronRight
                      size={14}
                      className={clsx(
                        'text-creme-faint transition-transform shrink-0',
                        isOpen && 'rotate-90',
                      )}
                    />
                    {isGlobal ? (
                      <Globe size={15} className="text-brand-bright shrink-0" />
                    ) : (
                      <FolderIcon size={15} className="text-creme-dim shrink-0" />
                    )}
                    <span className="text-[14px] font-bold text-creme">
                      {isGlobal ? 'Global' : scopeName}
                    </span>
                    <span className="chip chip-muted text-[11.5px]">{list.length}</span>
                    <span className="text-[12px] text-creme-faint ml-auto">
                      {list.filter((t) => t.active).length} ativas
                    </span>
                  </button>

                  {/* Tools dentro da pasta */}
                  {isOpen && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-surface-0/50">
                      {list.map((t) => {
                        const iconKey = getToolIcon(t.name);
                        const Icon = ICON_MAP[iconKey] || Server;
                        return (
                          <div
                            key={t.id}
                            className={clsx(
                              'bg-surface-2 border rounded-[10px] p-3.5 hover:border-hover transition-all group',
                              t.active ? 'border-default' : 'border-default opacity-60',
                            )}
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
                            <div className="text-[13px] text-creme-mute leading-relaxed mb-2.5 line-clamp-2">
                              {t.description}
                            </div>
                            <div className="flex items-center justify-between text-[12px] font-mono text-creme-faint">
                              <span className="truncate flex-1 mr-2">{t.method} {t.endpoint}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {showNew && <ToolModal onClose={() => setShowNew(false)} />}
      {editing && <ToolModal tool={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
