import { useState, useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import {
  Wrench, Plus, Users, FileText, Wifi, Zap, Server, Calendar,
  MessageSquare, Pencil, Search, Folder, FolderOpen, ChevronRight,
  Globe, FolderPlus, X,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { ToolModal } from '@/components/tools/ToolModal';
import type { Tool } from '@/types';

// ─── Pastas extras (vazias) — armazenadas em localStorage ────────────────────
// Pastas derivadas das tools (via scope) sempre aparecem; pastas extras criadas
// pelo user aparecem mesmo sem tools dentro, até serem populadas.
const EXTRA_FOLDERS_KEY = 'thribus.tools.extraFolders';

function loadExtraFolders(): string[] {
  try {
    const raw = localStorage.getItem(EXTRA_FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function saveExtraFolders(folders: string[]): void {
  try {
    localStorage.setItem(EXTRA_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // ignore
  }
}

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
  const [extraFolders, setExtraFolders] = useState<string[]>(() => loadExtraFolders());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const collapseInitialized = useRef(false);

  useEffect(() => {
    saveExtraFolders(extraFolders);
  }, [extraFolders]);

  // Por padrão, pastas começam retraídas. Roda só uma vez quando tools carregam.
  useEffect(() => {
    if (collapseInitialized.current || tools.length === 0) return;
    const allKeys = new Set<string>();
    for (const t of tools) {
      allKeys.add((t.scope || 'global').toLowerCase().trim());
    }
    for (const f of extraFolders) {
      allKeys.add(f.toLowerCase().trim());
    }
    setCollapsed(allKeys);
    collapseInitialized.current = true;
  }, [tools, extraFolders]);

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    // Não duplica se já existe (case-insensitive)
    const lower = name.toLowerCase();
    const existsInExtra = extraFolders.some((f) => f.toLowerCase() === lower);
    const existsInTools = tools.some((t) => (t.scope || '').toLowerCase() === lower);
    if (existsInExtra || existsInTools) {
      setShowNewFolder(false);
      setNewFolderName('');
      return;
    }
    setExtraFolders((prev) => [...prev, name]);
    // Pasta nova começa expandida (mais natural — user acabou de criar)
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(lower);
      return next;
    });
    setShowNewFolder(false);
    setNewFolderName('');
  };

  const handleDeleteFolder = (folderName: string) => {
    if (!confirm(`Remover pasta "${folderName}"? (Ferramentas dentro dela continuam, só a pasta vazia some.)`)) return;
    setExtraFolders((prev) => prev.filter((f) => f.toLowerCase() !== folderName.toLowerCase()));
  };

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
  // Inclui também pastas extras (criadas pelo user) mesmo se não tiverem tools.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; tools: Tool[]; isExtra: boolean }>();
    // Primeiro adiciona pastas extras (vazias)
    for (const folderName of extraFolders) {
      const key = folderName.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { name: folderName, tools: [], isExtra: true });
      }
    }
    // Depois popula com tools (se a tool tiver scope que bate com extra, marca como não-extra)
    for (const t of filtered) {
      const raw = t.scope || 'global';
      const key = raw.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { name: raw, tools: [], isExtra: false });
      }
      const entry = map.get(key)!;
      entry.tools.push(t);
      entry.isExtra = false; // pasta com tools não é mais "vazia"
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'global') return -1;
      if (b === 'global') return 1;
      return a.localeCompare(b);
    });
  }, [filtered, extraFolders]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Wrench size={16} className="text-creme-mute" /> Ferramentas Disponíveis
          <span className="ml-2 chip chip-muted">{tools.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={() => setShowNewFolder(true)}>
            <FolderPlus size={13} /> Nova Pasta
          </button>
          <button className="btn btn-accent" onClick={() => setShowNew(true)}>
            <Plus size={13} /> Nova Ferramenta
          </button>
        </div>
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
            {grouped.map(([scopeKey, { name: scopeName, tools: list, isExtra }]) => {
              const isOpen = !collapsed.has(scopeKey);
              const isGlobal = scopeKey === 'global';
              const FolderIcon = isOpen ? FolderOpen : Folder;
              const isEmpty = list.length === 0;
              return (
                <div key={scopeKey} className="bg-surface-1 border border-default rounded-[10px] overflow-hidden">
                  {/* Header — toggle */}
                  <div className="w-full flex items-center hover:bg-surface-hover transition-colors">
                    <button
                      onClick={() => toggleCollapse(scopeKey)}
                      className="flex-1 px-4 py-2.5 flex items-center gap-2.5"
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
                      {isExtra && (
                        <span className="text-[11px] text-creme-faint italic">(vazia)</span>
                      )}
                      <span className="text-[12px] text-creme-faint ml-auto">
                        {list.filter((t) => t.active).length} ativas
                      </span>
                    </button>
                    {isExtra && (
                      <button
                        onClick={() => handleDeleteFolder(scopeName)}
                        className="px-3 py-2 text-creme-faint hover:text-semantic-red transition-colors"
                        title="Remover pasta vazia"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Tools dentro da pasta */}
                  {isOpen && isEmpty && (
                    <div className="px-4 py-6 bg-surface-0/50 text-center">
                      <p className="text-[13px] text-creme-mute mb-3">
                        Pasta vazia. Crie uma ferramenta com escopo{' '}
                        <span className="font-mono text-creme">{scopeName}</span>{' '}
                        pra começar.
                      </p>
                      <button
                        className="btn btn-ghost mx-auto text-[12.5px]"
                        onClick={() => setShowNew(true)}
                      >
                        <Plus size={12} /> Adicionar ferramenta nesta pasta
                      </button>
                    </div>
                  )}
                  {isOpen && !isEmpty && (
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

      {showNewFolder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowNewFolder(false)}>
          <div className="bg-surface-1 border border-default rounded-[10px] p-6 max-w-[420px] w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[15px] font-bold text-creme mb-1">Nova pasta</h2>
            <p className="text-[12.5px] text-creme-mute mb-4">
              Pastas agrupam ferramentas por cliente. O nome aqui vira o <code className="font-mono text-brand">scope</code> das ferramentas.
            </p>
            <input
              type="text"
              autoFocus
              className="input mb-4"
              placeholder="Ex: Marketing, Suporte, NovoCliente"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolder(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setShowNewFolder(false)}>Cancelar</button>
              <button className="btn btn-accent" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                <FolderPlus size={13} /> Criar pasta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
