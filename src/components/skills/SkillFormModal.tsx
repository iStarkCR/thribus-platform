import { useEffect, useMemo, useState } from 'react';
import { X, Wrench, Sparkles, Tag, Hash } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Skill } from '@/types';

/**
 * Modal pra criar/editar skill no catálogo M3.
 *
 * Modes:
 *  - mode="create" — campos vazios, gera slug a partir do name
 *  - mode="edit"   — pré-preenchido, slug imutável (preserva FKs do agent_skills)
 *
 * Tools requeridas: multi-select com checkbox a partir das tools do banco
 * (filtradas pelas active=true). User só pode escolher tools que existem
 * — evita instalar skill que pede tool inexistente.
 */
interface Props {
  mode: 'create' | 'edit';
  skill?: Skill;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}

const SECTORS = ['isp', 'clinica', 'ecommerce', 'imobiliaria', 'educacao', 'outros'];

const SUGGESTED_ICONS = ['🧩', '📍', '🧑‍💼', '💰', '🛠️', '🎯', '📞', '📋', '🔧', '🤝', '⚡', '🎓'];

export function SkillFormModal({ mode, skill, onClose, onSaved }: Props) {
  const tools = useAppStore((s) => s.tools);
  const createSkill = useAppStore((s) => s.createSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);

  const [name, setName] = useState(skill?.name ?? '');
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [sector, setSector] = useState(skill?.sector ?? '');
  const [icon, setIcon] = useState(skill?.icon ?? '🧩');
  const [promptFragment, setPromptFragment] = useState(skill?.promptFragment ?? '');
  const [requiredTools, setRequiredTools] = useState<string[]>(skill?.requiredTools ?? []);
  const [version, setVersion] = useState(skill?.version ?? '1.0.0');
  const [isPublic, setIsPublic] = useState(skill?.isPublic ?? true);
  const [saving, setSaving] = useState(false);

  // Auto-gera slug enquanto user digita o nome (só em create)
  useEffect(() => {
    if (mode === 'create' && name) {
      const auto = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove diacríticos
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '')
        .slice(0, 50);
      setSlug(auto);
    }
  }, [name, mode]);

  const activeTools = useMemo(() => tools.filter((t) => t.active), [tools]);

  const toggleTool = (toolName: string) => {
    setRequiredTools((curr) =>
      curr.includes(toolName) ? curr.filter((t) => t !== toolName) : [...curr, toolName],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !promptFragment.trim()) return;

    setSaving(true);
    let saved: Skill | null = null;
    if (mode === 'create') {
      saved = await createSkill({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        sector: sector || undefined,
        icon,
        promptFragment: promptFragment.trim(),
        requiredTools,
        isPublic,
        version,
      });
    } else if (skill) {
      saved = await updateSkill(skill.id, {
        name: name.trim(),
        description: description.trim(),
        sector: sector || null,
        icon,
        promptFragment: promptFragment.trim(),
        requiredTools,
        isPublic,
        version,
      });
    }
    setSaving(false);

    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  const charCount = promptFragment.length;
  const charWarn = charCount > 2000;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">
                {mode === 'create' ? 'Nova Skill' : `Editar: ${skill?.name}`}
              </h2>
              <p className="text-[12.5px] text-creme-faint">
                Módulo reutilizável de prompt + tools (M3)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center text-creme-mute hover:text-creme transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Nome + Slug */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Nome *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Consulta de Viabilidade (ISP)"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                  <Hash size={11} /> Slug *
                  {mode === 'edit' && <span className="text-creme-faint normal-case font-normal">(imutável)</span>}
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={mode === 'edit'}
                  pattern="[a-z0-9-]+"
                  placeholder="consulta-viabilidade-isp"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand disabled:opacity-60"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                Descrição
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Curta descrição do que a skill faz"
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>

            {/* Sector + Icon + Version */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                  <Tag size={11} /> Setor
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme focus:outline-none focus:border-brand"
                >
                  <option value="">— qualquer —</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Ícone
                </label>
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED_ICONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIcon(i)}
                      className={`w-7 h-7 rounded-md text-[16px] flex items-center justify-center transition-all ${
                        icon === i ? 'bg-brand/20 ring-1 ring-brand' : 'bg-surface-2 hover:bg-surface-hover'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Versão
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  pattern="\d+\.\d+\.\d+"
                  placeholder="1.0.0"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            {/* Required tools */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                <Wrench size={11} /> Tools requisitadas <span className="text-creme-faint normal-case font-normal">({requiredTools.length})</span>
              </label>
              {activeTools.length === 0 ? (
                <p className="text-[12.5px] text-creme-faint italic p-3 bg-surface-2 rounded-lg border border-default">
                  Nenhuma tool ativa no sistema. Cadastre tools antes em /tools.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 max-h-[160px] overflow-y-auto p-2 bg-surface-2 rounded-lg border border-default">
                  {activeTools.map((t) => {
                    const checked = requiredTools.includes(t.name);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12.5px] transition-colors ${
                          checked ? 'bg-brand/10 text-brand-bright' : 'text-creme-dim hover:bg-surface-hover'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTool(t.name)}
                          className="accent-brand"
                        />
                        <span className="font-mono truncate" title={t.description}>{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Prompt fragment */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center justify-between">
                <span>Prompt Fragment *</span>
                <span className={`text-[11px] font-mono normal-case ${charWarn ? 'text-semantic-amber' : 'text-creme-faint'}`}>
                  {charCount} chars{charWarn && ' — pode degradar cache (>2k)'}
                </span>
              </label>
              <textarea
                value={promptFragment}
                onChange={(e) => setPromptFragment(e.target.value)}
                required
                rows={12}
                placeholder={`## Skill: Nome da Skill\n\nQuando o cliente fornecer X:\n1. Faça Y\n2. Se falhar, faça Z\n\n...`}
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand leading-relaxed resize-y min-h-[200px]"
              />
              <p className="text-[11.5px] text-creme-faint mt-1">
                Texto que será concatenado ao system_prompt do agent. Use Markdown — fica legível pro LLM. Ordem: prompt base + state reminder + skill fragments (em ordem alfabética por slug).
              </p>
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-default">
              <div>
                <div className="text-[13.5px] font-semibold text-creme">Skill pública</div>
                <div className="text-[11.5px] text-creme-faint">
                  Aparece no catálogo principal pra todos. Desligue pra fazer skill privada de workspace.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  isPublic ? 'bg-brand' : 'bg-surface-3'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    isPublic ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-default flex items-center justify-end gap-2 shrink-0 bg-surface-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !slug.trim() || !promptFragment.trim()}
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar skill' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
