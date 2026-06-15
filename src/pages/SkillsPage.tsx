import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Bot, Wrench, Layers, Search, ChevronDown,
  CheckCircle2, Circle, Trash2, Power, FileText, Tag,
  Plus, Pencil, GitFork, Globe, Lock, Users, Flame,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Skill } from '@/types';
import { SkillFormModal } from '@/components/skills/SkillFormModal';

type Tab = 'marketplace' | 'private';
type SortBy = 'popular' | 'recent' | 'name';

/**
 * Skills (M3) — catálogo + instalação por agente.
 *
 * Layout 3 colunas: lista de skills (catálogo), detalhe da skill selecionada
 * com prompt fragment + tools requisitadas, e painel de "agente alvo" pra
 * instalar/desinstalar a skill.
 *
 * Comporta-se gracefully se a migration 008 não foi aplicada — `skills`
 * fica vazio e mostramos empty state explicando o que fazer.
 */
export function SkillsPage() {
  const skills = useAppStore((s) => s.skills);
  const agents = useAppStore((s) => s.agents);
  const agentSkills = useAppStore((s) => s.agentSkills);
  const loadAgentSkills = useAppStore((s) => s.loadAgentSkills);
  const installSkill = useAppStore((s) => s.installSkill);
  const toggleSkill = useAppStore((s) => s.toggleSkill);
  const uninstallSkill = useAppStore((s) => s.uninstallSkill);

  const [search, setSearch] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('marketplace');
  const [sortBy, setSortBy] = useState<SortBy>('popular');
  const [sectorFilter, setSectorFilter] = useState<string>('');
  const forkSkill = useAppStore((s) => s.forkSkill);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = workspaces[0]?.id;

  // Quando seleciona agente, carrega skills instaladas
  useEffect(() => {
    if (selectedAgentId) {
      loadAgentSkills(selectedAgentId);
    }
  }, [selectedAgentId, loadAgentSkills]);

  // Quando agentes carregam, seleciona o primeiro se nada selecionado
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Filtragem por tab + busca + setor
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Tab filter
    if (tab === 'marketplace') {
      result = result.filter((s) => s.isPublic);
    } else {
      result = result.filter((s) => !s.isPublic && s.workspaceId === activeWorkspaceId);
    }

    // Sector filter
    if (sectorFilter) {
      result = result.filter((s) => s.sector === sectorFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      );
    }

    // Sort
    if (sortBy === 'popular') {
      result = [...result].sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));
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
  }, [skills, tab, search, sectorFilter, sortBy, activeWorkspaceId]);

  // Setores únicos pra filtro
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) {
      if (s.sector) set.add(s.sector);
    }
    return Array.from(set).sort();
  }, [skills]);

  // Stats das tabs
  const marketplaceCount = useMemo(() => skills.filter((s) => s.isPublic).length, [skills]);
  const privateCount = useMemo(
    () => skills.filter((s) => !s.isPublic && s.workspaceId === activeWorkspaceId).length,
    [skills, activeWorkspaceId],
  );

  const handleFork = async () => {
    if (!selectedSkill || !activeWorkspaceId) return;
    const forked = await forkSkill(selectedSkill.id, activeWorkspaceId);
    if (forked) {
      setTab('private');
      setSelectedSkillId(forked.id);
    }
  };

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) ?? null,
    [skills, selectedSkillId],
  );

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const installedForSelectedAgent = agentSkills[selectedAgentId] ?? [];

  const installedSkillIds = useMemo(
    () => new Set(installedForSelectedAgent.map((x) => x.skill.id)),
    [installedForSelectedAgent],
  );

  // ─── CRUD modals ──────────────────────────────────────────────────────────
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const deleteSkill = useAppStore((s) => s.deleteSkill);

  const openCreate = () => setModalMode('create');
  const openEdit = () => setModalMode('edit');
  const closeModal = () => setModalMode(null);

  const handleDelete = async () => {
    if (!selectedSkill) return;
    const confirmed = await useAppStore.getState().askConfirm({ title: 'Deletar skill', message: `Deletar a skill "${selectedSkill.name}"? Não dá pra desfazer. Skills instaladas em agentes precisam ser desinstaladas primeiro.`, confirmLabel: 'Deletar' });
    if (!confirmed) return;
    const ok = await deleteSkill(selectedSkill.id);
    if (ok) setSelectedSkillId(null);
  };

  // ─── Empty state — schema não aplicado OU sem skills criadas ─────────────
  if (skills.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
            <Sparkles size={16} className="text-creme-mute" /> Skills
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
          >
            <Plus size={13} /> Nova Skill
          </button>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-brand/10 flex items-center justify-center">
            <Layers size={24} className="text-brand-bright" />
          </div>
          <h3 className="text-[15px] font-bold text-creme mb-2">
            Nenhuma skill cadastrada ainda
          </h3>
          <p className="text-[13px] text-creme-faint max-w-[460px] mx-auto leading-relaxed">
            Skills empacotadas (M3) viram um catálogo de "habilidades" reutilizáveis
            que podem ser plugadas em qualquer agente — combinando prompt + tools +
            config sem precisar reescrever o prompt do zero.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
          >
            <Plus size={14} /> Criar primeira skill
          </button>
        </div>

        {modalMode && (
          <SkillFormModal mode={modalMode} onClose={closeModal} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Sparkles size={16} className="text-creme-mute" /> Skills
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
          >
            <Plus size={13} /> Nova Skill
          </button>

          <span className="w-px h-5 bg-default mx-1" />

          <span className="text-[12px] uppercase tracking-wider font-bold text-creme-faint">
            Agente alvo:
          </span>
          <div className="relative">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-surface-2 border border-default text-[13px] font-medium text-creme hover:border-hover focus:outline-none focus:border-brand cursor-pointer"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.client}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-creme-mute pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* ─── Tabs marketplace / privadas ──────────────────────────────────── */}
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
          {/* Filtro por setor */}
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

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="appearance-none pl-3 pr-8 py-1 rounded-md bg-surface-2 border border-default text-[12px] font-medium text-creme cursor-pointer focus:outline-none focus:border-brand"
          >
            <option value="popular">⭐ Mais instaladas</option>
            <option value="recent">🆕 Recentes</option>
            <option value="name">A→Z</option>
          </select>
        </div>
      </div>

      {/* Layout 3 colunas */}
      <div className="grid grid-cols-[320px_1fr_280px] gap-3 h-[calc(100vh-180px)] min-h-[500px]">
        {/* ─── Coluna 1: catálogo ───────────────────────────────────────── */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                type="text"
                placeholder="Buscar skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredSkills.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-[12.5px] text-creme-faint italic mb-2">
                  {tab === 'private' ? 'Você ainda não tem skills privadas.' : 'Nenhuma skill encontrada.'}
                </p>
                {tab === 'private' && (
                  <p className="text-[11.5px] text-creme-faint">
                    Forke uma skill do marketplace ou crie uma do zero (botão "Nova Skill").
                  </p>
                )}
              </div>
            ) : (
              filteredSkills.map((s, i) => (
                <SkillRow
                  key={s.id}
                  skill={s}
                  selected={s.id === selectedSkillId}
                  installed={installedSkillIds.has(s.id)}
                  onClick={() => setSelectedSkillId(s.id)}
                  showRank={sortBy === 'popular' && tab === 'marketplace'}
                  rank={i + 1}
                />
              ))
            )}
          </div>
        </div>

        {/* ─── Coluna 2: detalhe ────────────────────────────────────────── */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          {selectedSkill ? (
            <SkillDetail
              skill={selectedSkill}
              installedTools={selectedAgent?.tools ?? []}
              onEdit={openEdit}
              onDelete={handleDelete}
              onFork={tab === 'marketplace' && activeWorkspaceId ? handleFork : undefined}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Sparkles size={28} className="text-creme-faint mx-auto mb-2 opacity-50" />
                <p className="text-[13px] text-creme-faint">Selecione uma skill pra ver detalhes</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Coluna 3: instalações no agente selecionado ──────────────── */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <h3 className="text-[13px] font-bold text-creme flex items-center gap-1.5">
              <Bot size={13} className="text-brand-bright" />
              Em {selectedAgent?.name ?? '—'}
            </h3>
            <p className="text-[11px] text-creme-faint mt-0.5">
              {installedForSelectedAgent.length} skill{installedForSelectedAgent.length !== 1 ? 's' : ''} instalada{installedForSelectedAgent.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {installedForSelectedAgent.length === 0 ? (
              <p className="text-[12px] text-creme-faint italic p-3">
                Nenhuma skill instalada nesse agente. Selecione uma da lista e clique em "Instalar".
              </p>
            ) : (
              installedForSelectedAgent.map(({ skill, instance }) => (
                <InstalledSkillRow
                  key={instance.id}
                  skill={skill}
                  enabled={instance.enabled}
                  onToggle={() => toggleSkill(instance.id, selectedAgentId, !instance.enabled)}
                  onUninstall={() => uninstallSkill(instance.id, selectedAgentId)}
                />
              ))
            )}
          </div>

          {selectedSkill && !installedSkillIds.has(selectedSkill.id) && selectedAgent && (
            <div className="p-3 border-t border-default">
              <button
                onClick={() => installSkill(selectedAgentId, selectedSkill.id)}
                className="w-full py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all"
              >
                + Instalar em {selectedAgent.name}
              </button>
            </div>
          )}

          {selectedSkill && installedSkillIds.has(selectedSkill.id) && (
            <div className="p-3 border-t border-default">
              <p className="text-[11.5px] text-creme-faint flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-semantic-green" />
                Já instalada nesse agente
              </p>
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <SkillFormModal
          mode={modalMode}
          skill={modalMode === 'edit' ? selectedSkill ?? undefined : undefined}
          onClose={closeModal}
          onSaved={(saved) => setSelectedSkillId(saved.id)}
        />
      )}
    </>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

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

function SkillRow({
  skill, selected, installed, onClick, showRank, rank,
}: {
  skill: Skill;
  selected: boolean;
  installed: boolean;
  onClick: () => void;
  showRank?: boolean;
  rank?: number;
}) {
  const installCount = skill.installCount ?? 0;
  const isHot = installCount >= 3;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
        selected
          ? 'bg-brand/10 border-brand/30'
          : 'bg-surface-1 border-default hover:border-hover hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-start gap-2">
        {showRank && rank !== undefined && (
          <span className={`text-[10px] font-mono shrink-0 mt-1 w-5 text-center ${
            rank <= 3 ? 'text-brand-bright font-bold' : 'text-creme-faint'
          }`}>
            #{rank}
          </span>
        )}
        <span className="text-[18px] leading-none shrink-0 mt-0.5">{skill.icon ?? '🧩'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[13px] font-semibold truncate ${selected ? 'text-brand-bright' : 'text-creme'}`}>
              {skill.name}
            </span>
            {installed && (
              <CheckCircle2 size={11} className="text-semantic-green shrink-0" />
            )}
            {!skill.isPublic && (
              <Lock size={10} className="text-semantic-amber shrink-0" />
            )}
          </div>
          <div className="text-[11px] text-creme-faint truncate font-mono mt-0.5 flex items-center gap-1.5">
            <span>{skill.slug} · v{skill.version}</span>
            {installCount > 0 && (
              <span className={`flex items-center gap-0.5 ${isHot ? 'text-brand-bright' : ''}`}>
                {isHot && <Flame size={9} className="text-semantic-amber" />}
                <Users size={9} /> {installCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function SkillDetail({
  skill, installedTools, onEdit, onDelete, onFork,
}: {
  skill: Skill;
  installedTools: string[];
  onEdit: () => void;
  onDelete: () => void;
  onFork?: () => void;
}) {
  const installedToolsSet = new Set(installedTools);
  const missingTools = skill.requiredTools.filter((t) => !installedToolsSet.has(t));
  const installCount = skill.installCount ?? 0;
  return (
    <>
      {/* Header */}
      <div className="p-5 border-b border-default">
        <div className="flex items-start gap-3">
          <span className="text-[32px] leading-none shrink-0">{skill.icon ?? '🧩'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[17px] font-bold text-creme">{skill.name}</h3>
              <div className="flex items-center gap-1 shrink-0">
                {onFork && (
                  <button
                    onClick={onFork}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold bg-brand/10 text-brand-bright hover:bg-brand/20 transition-colors"
                    title="Forkar — duplica como skill privada do seu workspace pra editar"
                  >
                    <GitFork size={11} /> Fork
                  </button>
                )}
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-md text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
                  title="Editar skill"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={onDelete}
                  className="p-1.5 rounded-md text-semantic-red/70 hover:text-semantic-red hover:bg-semantic-red/10 transition-colors"
                  title="Deletar skill (precisa estar desinstalada)"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <code className="text-[11.5px] font-mono text-creme-faint">{skill.slug}</code>
              <span className="text-creme-faint">·</span>
              <span className="text-[11.5px] font-mono text-brand-dim">v{skill.version}</span>
              {skill.sector && (
                <>
                  <span className="text-creme-faint">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-surface-3 text-[11px] font-mono text-creme-dim">
                    <Tag size={9} /> {skill.sector}
                  </span>
                </>
              )}
              {skill.isPublic ? (
                <>
                  <span className="text-creme-faint">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-semantic-green/10 text-[11px] font-mono text-semantic-green">
                    <Globe size={9} /> público
                  </span>
                </>
              ) : (
                <>
                  <span className="text-creme-faint">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-semantic-amber/10 text-[11px] font-mono text-semantic-amber">
                    <Lock size={9} /> privada
                  </span>
                </>
              )}
              {installCount > 0 && (
                <>
                  <span className="text-creme-faint">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-brand/10 text-[11px] font-mono text-brand-bright">
                    <Users size={9} /> {installCount} {installCount === 1 ? 'agente' : 'agentes'}
                  </span>
                </>
              )}
            </div>
            <p className="text-[13px] text-creme-mute mt-2 leading-relaxed">{skill.description}</p>
          </div>
        </div>
      </div>

      {/* Body — scroll */}
      <div className="flex-1 overflow-y-auto">
        {/* Required tools */}
        <div className="p-5 border-b border-default">
          <div className="flex items-center gap-2 mb-2.5">
            <Wrench size={13} className="text-brand-bright" />
            <h4 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim">
              Tools requisitadas
            </h4>
          </div>
          {skill.requiredTools.length === 0 ? (
            <p className="text-[12px] text-creme-faint italic">Esta skill não requer tools adicionais.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {skill.requiredTools.map((t) => {
                const isInstalled = installedToolsSet.has(t);
                return (
                  <span
                    key={t}
                    className={`px-2 py-0.5 rounded-full text-[12px] font-mono inline-flex items-center gap-1 ${
                      isInstalled
                        ? 'bg-semantic-green/10 text-semantic-green'
                        : 'bg-semantic-amber/10 text-semantic-amber'
                    }`}
                    title={isInstalled ? 'Tool já no agente' : 'Tool ainda não está no agente — será adicionada na instalação'}
                  >
                    {isInstalled ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                    {t}
                  </span>
                );
              })}
            </div>
          )}
          {missingTools.length > 0 && (
            <p className="text-[11px] text-semantic-amber/80 mt-2 leading-relaxed">
              {missingTools.length} tool{missingTools.length !== 1 ? 's' : ''} ser{missingTools.length !== 1 ? 'ão adicionadas' : 'á adicionada'} ao agente quando instalar essa skill.
            </p>
          )}
        </div>

        {/* Prompt fragment */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2.5">
            <FileText size={13} className="text-brand-bright" />
            <h4 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim">
              Prompt fragment
            </h4>
            <span className="ml-auto text-[11px] font-mono text-creme-faint">
              {skill.promptFragment.length} chars
            </span>
          </div>
          {skill.promptFragment.trim() ? (
            <pre className="bg-surface-1 border border-default rounded-lg p-3 text-[12px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
              {skill.promptFragment}
            </pre>
          ) : (
            <p className="text-[12px] text-creme-faint italic">Sem prompt fragment definido.</p>
          )}
        </div>
      </div>
    </>
  );
}

function InstalledSkillRow({
  skill, enabled, onToggle, onUninstall,
}: {
  skill: Skill;
  enabled: boolean;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  return (
    <div
      className={`p-2.5 rounded-lg border transition-all ${
        enabled ? 'bg-surface-1 border-default' : 'bg-surface-1/50 border-default opacity-60'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-[16px] leading-none shrink-0 mt-0.5">{skill.icon ?? '🧩'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-creme truncate">{skill.name}</div>
          <div className="text-[10.5px] text-creme-faint truncate font-mono">v{skill.version}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <button
          onClick={onToggle}
          className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
            enabled
              ? 'bg-semantic-green/10 text-semantic-green hover:bg-semantic-green/20'
              : 'bg-surface-3 text-creme-mute hover:bg-surface-hover'
          }`}
          title={enabled ? 'Desativar (mantém instalada)' : 'Ativar'}
        >
          <Power size={10} />
          {enabled ? 'Ativa' : 'Off'}
        </button>
        <button
          onClick={onUninstall}
          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-semantic-red/10 text-semantic-red hover:bg-semantic-red/20 flex items-center justify-center gap-1 transition-colors"
          title="Desinstalar"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
