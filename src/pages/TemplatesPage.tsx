import { useMemo, useState } from 'react';
import {
  Layout, Plus, Search, Pencil, Trash2, Wrench, Tag,
  Users, FileText, Globe, Lock, ChevronRight, GitFork,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import { TemplateFormModal } from '@/components/templates/TemplateFormModal';
import type { AgentTemplate } from '@/types';

/**
 * Templates (M1 + M4) — gerenciamento + marketplace.
 *
 * Tabs:
 *  - Marketplace: templates públicos compartilhados
 *  - Minhas privadas: templates do workspace ativo (criados ou forkados)
 *
 * Ações por template:
 *  - Editar / deletar (em hover)
 *  - Forkar (clonar pra workspace privado, editável)
 *  - Criar agente a partir dele (link pra /agents)
 */
type Tab = 'marketplace' | 'private';
type SortBy = 'popular' | 'recent' | 'name';

export function TemplatesPage() {
  const templates = useAppStore((s) => s.templates);
  const workspaces = useAppStore((s) => s.workspaces);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const forkTemplate = useAppStore((s) => s.forkTemplate);
  const navigate = useNavigate();
  const activeWorkspaceId = workspaces[0]?.id;

  const [tab, setTab] = useState<Tab>('marketplace');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('popular');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; template?: AgentTemplate } | null>(null);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Tab filter
    if (tab === 'marketplace') {
      result = result.filter((t) => t.isPublic);
    } else {
      result = result.filter((t) => !t.isPublic && t.workspaceId === activeWorkspaceId);
    }

    if (sectorFilter) result = result.filter((t) => t.sector === sectorFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }

    if (sortBy === 'popular') {
      result = [...result].sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0));
    } else if (sortBy === 'recent') {
      result = [...result].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });
    } else {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [templates, tab, search, sectorFilter, sortBy, activeWorkspaceId]);

  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) {
      if (t.sector) set.add(t.sector);
    }
    return Array.from(set).sort();
  }, [templates]);

  const marketplaceCount = useMemo(() => templates.filter((t) => t.isPublic).length, [templates]);
  const privateCount = useMemo(
    () => templates.filter((t) => !t.isPublic && t.workspaceId === activeWorkspaceId).length,
    [templates, activeWorkspaceId],
  );

  const handleDelete = async (template: AgentTemplate) => {
    if (!confirm(`Deletar template "${template.name}"?\n\nAgentes já criados a partir dele NÃO são afetados.`)) return;
    await deleteTemplate(template.id);
  };

  const handleFork = async (template: AgentTemplate) => {
    if (!activeWorkspaceId) return;
    const forked = await forkTemplate(template.id, activeWorkspaceId);
    if (forked) {
      setTab('private');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Layout size={16} className="text-creme-mute" /> Templates
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalState({ mode: 'create' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
          >
            <Plus size={13} /> Novo Template
          </button>
        </div>
      </div>

      {/* Tabs marketplace / privadas */}
      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabButton
          active={tab === 'marketplace'}
          onClick={() => setTab('marketplace')}
          icon={<Globe size={13} />}
          label="Marketplace"
          count={marketplaceCount}
        />
        <TabButton
          active={tab === 'private'}
          onClick={() => setTab('private')}
          icon={<Lock size={13} />}
          label="Minhas privadas"
          count={privateCount}
        />

        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1 rounded-md bg-surface-2 border border-default text-[12px] font-medium text-creme cursor-pointer focus:outline-none focus:border-brand"
          >
            <option value="">Todos setores</option>
            {availableSectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="appearance-none pl-3 pr-8 py-1 rounded-md bg-surface-2 border border-default text-[12px] font-medium text-creme cursor-pointer focus:outline-none focus:border-brand"
          >
            <option value="popular">⭐ Mais usados</option>
            <option value="recent">🆕 Recentes</option>
            <option value="name">A→Z</option>
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3 max-w-md">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, slug ou descrição..."
          className="w-full pl-8 pr-3 py-1.5 rounded-md bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
        />
      </div>

      {/* Cards */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-surface-2 border border-default rounded-[10px] p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-brand/10 flex items-center justify-center">
            <Layout size={24} className="text-brand-bright" />
          </div>
          <h3 className="text-[15px] font-bold text-creme mb-2">
            {tab === 'private' ? 'Você ainda não tem templates privados' : 'Nenhum resultado'}
          </h3>
          <p className="text-[13px] text-creme-faint max-w-[460px] mx-auto leading-relaxed">
            {tab === 'private'
              ? 'Forke um template do marketplace pra customizar, ou crie um do zero. Você também pode salvar um agente existente como template via "Salvar como template" na página de Colaboradores.'
              : 'Nenhum template bate com os filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredTemplates.map((t, i) => (
            <TemplateCard
              key={t.id}
              template={t}
              rank={sortBy === 'popular' && tab === 'marketplace' ? i + 1 : undefined}
              onEdit={() => setModalState({ mode: 'edit', template: t })}
              onDelete={() => handleDelete(t)}
              onUseToCreateAgent={() => navigate('/agents')}
              onFork={tab === 'marketplace' && activeWorkspaceId ? () => handleFork(t) : undefined}
            />
          ))}
        </div>
      )}

      {modalState && (
        <TemplateFormModal
          mode={modalState.mode}
          template={modalState.template}
          onClose={() => setModalState(null)}
        />
      )}
    </>
  );
}

// ─── TabButton ─────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px ${
        active
          ? 'text-brand-bright border-brand'
          : 'text-creme-mute hover:text-creme border-transparent'
      }`}
    >
      {icon}
      {label}
      <span className={`text-[11px] font-mono px-1.5 py-px rounded-full ${
        active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint'
      }`}>
        {count}
      </span>
    </button>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

function TemplateCard({
  template, rank, onEdit, onDelete, onUseToCreateAgent, onFork,
}: {
  template: AgentTemplate;
  rank?: number;
  onEdit: () => void;
  onDelete: () => void;
  onUseToCreateAgent: () => void;
  onFork?: () => void;
}) {
  const useCount = template.useCount ?? 0;
  const isHot = useCount >= 1;
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {rank !== undefined && (
            <span className={`text-[10px] font-mono shrink-0 mt-1 ${
              rank <= 3 ? 'text-brand-bright font-bold' : 'text-creme-faint'
            }`}>
              #{rank}
            </span>
          )}
          <span className="text-[28px] leading-none shrink-0">{template.icon ?? '🎯'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14.5px] font-bold text-creme truncate">{template.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-creme-faint flex-wrap">
              <span>{template.slug}</span>
              {template.sector && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Tag size={9} /> {template.sector}
                  </span>
                </>
              )}
              {template.isPublic ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-semantic-green">
                    <Globe size={9} /> público
                  </span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-semantic-amber">
                    <Lock size={9} /> privado
                  </span>
                </>
              )}
              {useCount > 0 && (
                <>
                  <span>·</span>
                  <span className={`inline-flex items-center gap-0.5 ${isHot ? 'text-brand-bright' : ''}`}>
                    {isHot && '🔥 '}
                    <Users size={9} /> {useCount} {useCount === 1 ? 'agente' : 'agentes'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onFork && (
            <button
              onClick={onFork}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-brand/10 text-brand-bright hover:bg-brand/20 transition-colors"
              title="Forkar — duplica como privado pra editar"
            >
              <GitFork size={11} /> Fork
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            title="Editar template"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-semantic-red/70 hover:text-semantic-red hover:bg-semantic-red/10 transition-colors"
            title="Deletar template"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <p className="text-[13px] text-creme-mute leading-relaxed mb-3 line-clamp-2">
        {template.description || <span className="italic text-creme-faint">Sem descrição</span>}
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={<Wrench size={11} />} label="Tools" value={template.defaultTools.length} />
        <Stat icon={<FileText size={11} />} label="Modelo" value={template.defaultModel} mono />
        <Stat icon={<Users size={11} />} label="Em uso" value={useCount} accent={useCount > 0 ? 'brand' : 'muted'} />
      </div>

      {template.defaultTools.length > 0 && (
        <div className="mb-3">
          <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">Tools default</div>
          <div className="flex flex-wrap gap-1">
            {template.defaultTools.slice(0, 5).map((t) => (
              <code key={t} className="text-[10.5px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-dim">{t}</code>
            ))}
            {template.defaultTools.length > 5 && (
              <span className="text-[10.5px] font-mono text-creme-faint">+{template.defaultTools.length - 5}</span>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onUseToCreateAgent}
        className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-brand-bright bg-brand/5 hover:bg-brand/10 transition-colors"
      >
        Criar agente a partir deste template <ChevronRight size={12} />
      </button>
    </div>
  );
}

function Stat({
  icon, label, value, accent = 'muted', mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: 'brand' | 'muted';
  mono?: boolean;
}) {
  return (
    <div className="bg-surface-1 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-creme-faint">
        <span className={accent === 'brand' ? 'text-brand-bright' : 'text-creme-faint'}>{icon}</span>
        {label}
      </div>
      <div className={`text-[12.5px] font-bold mt-0.5 truncate ${mono ? 'font-mono' : ''} ${accent === 'brand' ? 'text-brand-bright' : 'text-creme'}`} title={String(value)}>
        {value}
      </div>
    </div>
  );
}
