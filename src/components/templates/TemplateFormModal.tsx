import { useEffect, useMemo, useState } from 'react';
import {
  X, Wrench, Tag, Hash, Search, Wand2, Eye,
  CheckCircle2, AlertCircle, Loader2, Layout,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { AgentTemplate, AIModel } from '@/types';

/**
 * Modal pra criar/editar AgentTemplate (M1).
 *
 * Diferenças vs SkillFormModal:
 *  - Templates criam agente do ZERO (incluem tools default + model)
 *  - Skills enriquecem agente existente
 *  - Templates têm `base_prompt` (system_prompt completo)
 *  - Skills têm `prompt_fragment` (concatenado ao system_prompt)
 *
 * Modes:
 *  - "create" — campos vazios
 *  - "edit"   — pré-preenchido, slug imutável
 */
interface Props {
  mode: 'create' | 'edit';
  template?: AgentTemplate;
  onClose: () => void;
  onSaved?: (template: AgentTemplate) => void;
}

const SECTORS = ['isp', 'clinica', 'ecommerce', 'imobiliaria', 'educacao', 'outros'];

const SUGGESTED_ICONS = ['🎯', '🛠️', '💰', '📞', '🤝', '🎓', '🏥', '🏪', '🏘️', '✨', '⚡', '🔧'];

const MODELS: AIModel[] = [
  'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5',
  'claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6',
];

export function TemplateFormModal({ mode, template, onClose, onSaved }: Props) {
  const tools = useAppStore((s) => s.tools);
  const templates = useAppStore((s) => s.templates);
  const createTemplate = useAppStore((s) => s.createTemplate);
  const updateTemplate = useAppStore((s) => s.updateTemplate);

  const [name, setName] = useState(template?.name ?? '');
  const [slug, setSlug] = useState(template?.slug ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [sector, setSector] = useState(template?.sector ?? 'outros');
  const [icon, setIcon] = useState(template?.icon ?? '🎯');
  const [customIcon, setCustomIcon] = useState('');
  const [basePrompt, setBasePrompt] = useState(template?.basePrompt ?? '');
  const [defaultTools, setDefaultTools] = useState<string[]>(template?.defaultTools ?? []);
  const [defaultModel, setDefaultModel] = useState<string>(template?.defaultModel ?? 'gpt-4o-mini');
  const [isPublic, setIsPublic] = useState(template?.isPublic ?? true);

  const [saving, setSaving] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Auto-gera slug em create mode
  useEffect(() => {
    if (mode === 'create' && name) {
      const auto = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '')
        .slice(0, 50);
      setSlug(auto);
    }
  }, [name, mode]);

  const activeTools = useMemo(() => tools.filter((t) => t.active), [tools]);

  const filteredTools = useMemo(() => {
    if (!toolSearch.trim()) return activeTools;
    const q = toolSearch.toLowerCase();
    return activeTools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [activeTools, toolSearch]);

  const slugStatus = useMemo((): { state: string; message: string } => {
    if (mode === 'edit') return { state: 'edit', message: 'Imutável' };
    if (!slug) return { state: 'idle', message: '' };
    if (!/^[a-z0-9-]+$/.test(slug)) return { state: 'invalid', message: 'só letras, números e hífen' };
    const exists = templates.find((t) => t.slug === slug);
    if (exists) return { state: 'taken', message: 'já existe' };
    return { state: 'available', message: 'disponível' };
  }, [slug, templates, mode]);

  // Detecta variáveis {NOME_AGENTE}, {NOME_PROVEDOR}, etc no prompt
  const detectedVariables = useMemo(() => {
    const matches = basePrompt.match(/\{[A-Z_]+\}/g) ?? [];
    return Array.from(new Set(matches));
  }, [basePrompt]);

  // Auto-detecta tools mencionadas no prompt
  const detectedTools = useMemo(() => {
    if (!basePrompt) return [];
    const found = new Set<string>();
    for (const t of activeTools) {
      const re = new RegExp(`\\b${t.name}\\b`, 'i');
      if (re.test(basePrompt)) found.add(t.name);
    }
    return Array.from(found);
  }, [basePrompt, activeTools]);

  const missingDetectedTools = detectedTools.filter((t) => !defaultTools.includes(t));

  const acceptDetectedTools = () => {
    setDefaultTools((curr) => Array.from(new Set([...curr, ...detectedTools])));
  };

  const toggleTool = (toolName: string) => {
    setDefaultTools((curr) =>
      curr.includes(toolName) ? curr.filter((t) => t !== toolName) : [...curr, toolName],
    );
  };

  const handleCustomIcon = (value: string) => {
    setCustomIcon(value);
    if (value.trim()) {
      const first = Array.from(value)[0];
      if (first) setIcon(first);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !basePrompt.trim()) return;
    if (slugStatus.state === 'taken' || slugStatus.state === 'invalid') return;

    setSaving(true);
    let saved: AgentTemplate | null = null;
    if (mode === 'create') {
      // Se for privado, vincula ao workspace ativo automaticamente
      const activeWs = useAppStore.getState().workspaces[0]?.id;
      saved = await createTemplate({
        slug: slug.trim(),
        name: name.trim(),
        sector,
        description: description.trim(),
        basePrompt: basePrompt.trim(),
        defaultTools,
        defaultModel,
        icon,
        isPublic,
        workspaceId: !isPublic ? activeWs : undefined,
      });
    } else if (template) {
      saved = await updateTemplate(template.id, {
        name: name.trim(),
        sector,
        description: description.trim(),
        basePrompt: basePrompt.trim(),
        defaultTools,
        defaultModel,
        icon,
        isPublic,
      });
    }
    setSaving(false);

    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Layout size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">
                {mode === 'create' ? 'Novo Template' : `Editar: ${template?.name}`}
              </h2>
              <p className="text-[12.5px] text-creme-faint">
                Cria agente novo do zero (M1) — diferente de skill, que enriquece agente existente
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
                  placeholder="Vendedor ISP (Bianca)"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1 justify-between">
                  <span className="flex items-center gap-1">
                    <Hash size={11} /> Slug *
                  </span>
                  <SlugBadge status={slugStatus} />
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={mode === 'edit'}
                  pattern="[a-z0-9-]+"
                  placeholder="vendas-isp"
                  className={`w-full px-3 py-2 rounded-lg bg-surface-2 border text-[14px] text-creme placeholder-creme-faint font-mono focus:outline-none disabled:opacity-60 ${
                    slugStatus.state === 'taken' || slugStatus.state === 'invalid'
                      ? 'border-semantic-red focus:border-semantic-red'
                      : 'border-default focus:border-brand'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                Descrição
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Agente de vendas pra ISP — funil completo do contato à instalação"
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>

            {/* Sector + Icon + Model */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                  <Tag size={11} /> Setor
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme focus:outline-none focus:border-brand"
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Ícone <span className="font-normal text-creme-faint">(atual: {icon})</span>
                </label>
                <div className="flex flex-wrap gap-1 items-center">
                  {SUGGESTED_ICONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setIcon(i); setCustomIcon(''); }}
                      className={`w-7 h-7 rounded-md text-[16px] flex items-center justify-center transition-all ${
                        icon === i && !customIcon ? 'bg-brand/20 ring-1 ring-brand' : 'bg-surface-2 hover:bg-surface-hover'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={customIcon}
                    onChange={(e) => handleCustomIcon(e.target.value)}
                    placeholder="✨"
                    maxLength={4}
                    className="w-12 h-7 rounded-md bg-surface-2 border border-default text-center text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Modelo IA default
                </label>
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme font-mono focus:outline-none focus:border-brand"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tools */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint flex items-center gap-1">
                  <Wrench size={11} /> Tools default <span className="text-creme-faint normal-case font-normal">({defaultTools.length})</span>
                </label>
                {missingDetectedTools.length > 0 && (
                  <button
                    type="button"
                    onClick={acceptDetectedTools}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/10 text-brand-bright text-[11px] font-semibold hover:bg-brand/20 transition-colors"
                  >
                    <Wand2 size={10} /> Sugerir {missingDetectedTools.length} do prompt
                  </button>
                )}
              </div>

              {activeTools.length === 0 ? (
                <p className="text-[12.5px] text-creme-faint italic p-3 bg-surface-2 rounded-lg border border-default">
                  Nenhuma tool ativa no sistema.
                </p>
              ) : (
                <>
                  <div className="relative mb-1.5">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
                    <input
                      type="text"
                      value={toolSearch}
                      onChange={(e) => setToolSearch(e.target.value)}
                      placeholder="Buscar tool..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-[160px] overflow-y-auto p-2 bg-surface-2 rounded-lg border border-default">
                    {filteredTools.length === 0 ? (
                      <p className="text-[11.5px] text-creme-faint italic col-span-3 p-2">
                        Nenhuma tool encontrada.
                      </p>
                    ) : (
                      filteredTools.map((t) => {
                        const checked = defaultTools.includes(t.name);
                        const detected = detectedTools.includes(t.name);
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12.5px] transition-colors ${
                              checked
                                ? 'bg-brand/10 text-brand-bright'
                                : detected
                                  ? 'bg-semantic-amber/5 text-creme-dim hover:bg-semantic-amber/10'
                                  : 'text-creme-dim hover:bg-surface-hover'
                            }`}
                            title={t.description}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTool(t.name)}
                              className="accent-brand"
                            />
                            <span className="font-mono truncate flex-1">{t.name}</span>
                            {detected && !checked && (
                              <Wand2 size={10} className="text-semantic-amber shrink-0" />
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Variáveis detectadas */}
            {detectedVariables.length > 0 && (
              <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
                <div className="text-[11.5px] uppercase tracking-wider font-bold text-brand-bright mb-1.5 flex items-center gap-1">
                  <Wand2 size={11} /> Variáveis no prompt ({detectedVariables.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedVariables.map((v) => (
                    <code key={v} className="px-1.5 py-0.5 rounded bg-brand/10 text-brand-bright text-[11px] font-mono">
                      {v}
                    </code>
                  ))}
                </div>
                <p className="text-[11px] text-creme-faint mt-1.5">
                  Quando alguém criar agente a partir desse template, vai precisar substituir essas variáveis pelos valores reais.
                </p>
              </div>
            )}

            {/* Base prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint">
                  Base Prompt *
                </label>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-creme-faint">
                    {basePrompt.length} chars · ~{Math.ceil(basePrompt.length / 3.5)} tokens
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1 text-creme-mute hover:text-creme transition-colors normal-case"
                  >
                    <Eye size={11} /> {showPreview ? 'Editor' : 'Preview'}
                  </button>
                </div>
              </div>

              {showPreview ? (
                <div className="bg-surface-2 border border-default rounded-lg p-4 min-h-[280px] max-h-[450px] overflow-y-auto">
                  <pre className="text-[12px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed">
                    {basePrompt || '...prompt vazio...'}
                  </pre>
                </div>
              ) : (
                <textarea
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  required
                  rows={14}
                  placeholder={`# Identidade\nVocê é {NOME_AGENTE}, atendente da {NOME_PROVEDOR}...\n\n# Estados\n## Estado 1 - Boas-vindas\n...`}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand leading-relaxed resize-y min-h-[280px]"
                />
              )}
              {!showPreview && (
                <p className="text-[11.5px] text-creme-faint mt-1">
                  System prompt completo do agente. Use {'{VARIÁVEIS}'} pra placeholders que serão preenchidos no momento de criar o agente (ex: {'{NOME_AGENTE}'}, {'{NOME_PROVEDOR}'}).
                </p>
              )}
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-default">
              <div>
                <div className="text-[13.5px] font-semibold text-creme">Template público</div>
                <div className="text-[11.5px] text-creme-faint">
                  Aparece no catálogo principal pra todos os workspaces.
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
              disabled={
                saving ||
                !name.trim() ||
                !slug.trim() ||
                !basePrompt.trim() ||
                slugStatus.state === 'taken' ||
                slugStatus.state === 'invalid'
              }
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : mode === 'create' ? 'Criar template' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SlugBadge({ status }: { status: { state: string; message: string } }) {
  if (status.state === 'idle') return null;
  const map = {
    available: { color: 'text-semantic-green', icon: CheckCircle2 },
    taken:     { color: 'text-semantic-red', icon: AlertCircle },
    invalid:   { color: 'text-semantic-amber', icon: AlertCircle },
    edit:      { color: 'text-creme-faint', icon: undefined },
  } as const;
  const cfg = map[status.state as keyof typeof map];
  const Icon = cfg?.icon;
  return (
    <span className={`text-[10.5px] font-mono normal-case font-normal flex items-center gap-1 ${cfg?.color ?? 'text-creme-faint'}`}>
      {Icon && <Icon size={10} />}
      {status.message}
    </span>
  );
}
