import { useMemo, useState } from 'react';
import {
  Layout, Plus, Search, Pencil, Trash2, Wrench, Tag,
  Users, FileText, Globe, Lock, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import { TemplateFormModal } from '@/components/templates/TemplateFormModal';
import type { AgentTemplate } from '@/types';

/**
 * Templates (M1) — gerenciamento completo do catálogo.
 *
 * Fluxos cobertos:
 *  - Listar todos templates (públicos + privados)
 *  - Filtro por setor + busca
 *  - Criar novo template do zero
 *  - Editar template existente
 *  - Deletar template (com confirmação)
 *
 * Templates aqui são DIFERENTES de skills:
 *  - Template = base completa pra criar agente NOVO (system_prompt + tools + model)
 *  - Skill = módulo plugado em agente EXISTENTE (prompt_fragment + tools)
 *
 * Quando criar agente novo via NewAgentModal, o user escolhe um template
 * desta lista.
 */
export function TemplatesPage() {
  const templates = useAppStore((s) => s.templates);
  const agents = useAppStore((s) => s.agents);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; template?: AgentTemplate } | null>(null);

  const filteredTemplates = useMemo(() => {
    let result = templates;
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
    return result;
  }, [templates, search, sectorFilter]);

  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) {
      if (t.sector) set.add(t.sector);
    }
    return Array.from(set).sort();
  }, [templates]);

  // Usage stats — quantos agents foram criados de cada template
  // (heurística: matching por sector + tools — não é perfeito mas dá ordem)
  const usageBySlug = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of templates) {
      const matchingAgents = agents.filter(
        (a) => a.sector === t.sector && JSON.stringify(a.tools.sort()) === JSON.stringify(t.defaultTools.sort()),
      );
      map[t.slug] = matchingAgents.length;
    }
    return map;
  }, [templates, agents]);

  const handleDelete = async (template: AgentTemplate) => {
    if (!confirm(`Deletar template "${template.name}"?\n\nAgentes já criados a partir dele NÃO são afetados — eles são entidades independentes.`)) return;
    await deleteTemplate(template.id);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Layout size={16} className="text-creme-mute" /> Templates
          <span className="ml-2 text-[12px] font-mono text-creme-faint">
            {templates.length} disponíveis
          </span>
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

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, slug ou descrição..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] font-medium text-creme cursor-pointer focus:outline-none focus:border-brand"
        >
          <option value="">Todos setores</option>
          {availableSectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Cards de templates */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-surface-2 border border-default rounded-[10px] p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-brand/10 flex items-center justify-center">
            <Layout size={24} className="text-brand-bright" />
          </div>
          <h3 className="text-[15px] font-bold text-creme mb-2">
            {templates.length === 0 ? 'Nenhum template ainda' : 'Nenhum resultado'}
          </h3>
          <p className="text-[13px] text-creme-faint max-w-[460px] mx-auto leading-relaxed mb-4">
            {templates.length === 0
              ? 'Templates aceleram a criação de agentes novos. Crie do zero ou converta um agente existente em template via "Salvar como template" na aba Colaboradores.'
              : 'Nenhum template bate com os filtros aplicados.'}
          </p>
          {templates.length === 0 && (
            <button
              onClick={() => setModalState({ mode: 'create' })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
            >
              <Plus size={14} /> Criar primeiro template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              usageCount={usageBySlug[t.slug] ?? 0}
              onEdit={() => setModalState({ mode: 'edit', template: t })}
              onDelete={() => handleDelete(t)}
              onUseToCreateAgent={() => navigate('/agents')}
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

// ─── Card de template ──────────────────────────────────────────────────────

function TemplateCard({
  template, usageCount, onEdit, onDelete, onUseToCreateAgent,
}: {
  template: AgentTemplate;
  usageCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onUseToCreateAgent: () => void;
}) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all group">
      {/* Header com icon + actions */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="text-[28px] leading-none shrink-0">{template.icon ?? '🎯'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14.5px] font-bold text-creme truncate">{template.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-creme-faint">
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
            </div>
          </div>
        </div>

        {/* Actions — visíveis no hover */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

      {/* Descrição */}
      <p className="text-[13px] text-creme-mute leading-relaxed mb-3 line-clamp-2">
        {template.description || <span className="italic text-creme-faint">Sem descrição</span>}
      </p>

      {/* Stats: tools + model + uso */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={<Wrench size={11} />} label="Tools" value={template.defaultTools.length} />
        <Stat icon={<FileText size={11} />} label="Modelo" value={template.defaultModel} mono />
        <Stat icon={<Users size={11} />} label="Em uso" value={usageCount} accent={usageCount > 0 ? 'brand' : 'muted'} />
      </div>

      {/* Tools preview */}
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

      {/* CTA — usar template */}
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
