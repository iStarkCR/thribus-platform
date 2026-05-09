import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Bot, Wrench, Layers, Search, ChevronDown,
  CheckCircle2, Circle, Trash2, Power, FileText, Tag,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Skill } from '@/types';

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

  // Filtragem por busca
  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [skills, search]);

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

  // ─── Empty state — schema não aplicado ────────────────────────────────────
  if (skills.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-4">
          <Sparkles size={16} className="text-creme-mute" /> Skills
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
          <p className="text-[12px] text-creme-faint mt-3">
            Aplique a migration <code className="font-mono text-brand-dim">008_skills.sql</code> no banco
            do worker pra habilitar.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Sparkles size={16} className="text-creme-mute" /> Skills
          <span className="ml-2 text-[12px] font-mono text-creme-faint">
            {skills.length} disponíveis
          </span>
        </div>

        {/* Seletor de agente */}
        <div className="flex items-center gap-2">
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
              <p className="text-[12px] text-creme-faint italic p-3">Nenhuma skill encontrada.</p>
            ) : (
              filteredSkills.map((s) => (
                <SkillRow
                  key={s.id}
                  skill={s}
                  selected={s.id === selectedSkillId}
                  installed={installedSkillIds.has(s.id)}
                  onClick={() => setSelectedSkillId(s.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ─── Coluna 2: detalhe ────────────────────────────────────────── */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          {selectedSkill ? (
            <SkillDetail skill={selectedSkill} installedTools={selectedAgent?.tools ?? []} />
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
    </>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function SkillRow({
  skill, selected, installed, onClick,
}: {
  skill: Skill;
  selected: boolean;
  installed: boolean;
  onClick: () => void;
}) {
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
        <span className="text-[18px] leading-none shrink-0 mt-0.5">{skill.icon ?? '🧩'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[13px] font-semibold truncate ${selected ? 'text-brand-bright' : 'text-creme'}`}>
              {skill.name}
            </span>
            {installed && (
              <CheckCircle2 size={11} className="text-semantic-green shrink-0" />
            )}
          </div>
          <div className="text-[11px] text-creme-faint truncate font-mono mt-0.5">
            {skill.slug} · v{skill.version}
          </div>
        </div>
      </div>
    </button>
  );
}

function SkillDetail({ skill, installedTools }: { skill: Skill; installedTools: string[] }) {
  const installedToolsSet = new Set(installedTools);
  const missingTools = skill.requiredTools.filter((t) => !installedToolsSet.has(t));
  return (
    <>
      {/* Header */}
      <div className="p-5 border-b border-default">
        <div className="flex items-start gap-3">
          <span className="text-[32px] leading-none shrink-0">{skill.icon ?? '🧩'}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[17px] font-bold text-creme">{skill.name}</h3>
            <div className="flex items-center gap-2 mt-1">
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
