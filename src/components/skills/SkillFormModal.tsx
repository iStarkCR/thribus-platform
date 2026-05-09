import { useEffect, useMemo, useState } from 'react';
import {
  X, Wrench, Sparkles, Tag, Hash, Search, Wand2, Eye, FileText,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Skill } from '@/types';

/**
 * Modal pra criar/editar skill no catálogo M3.
 *
 * Recursos:
 *  - Slug auto-gerado (com validação de unicidade inline)
 *  - 12 ícones sugeridos + input pra emoji custom
 *  - Templates de prompt prontos (FAQ / Fluxo / Erro técnico / Vazio)
 *  - Tools picker com busca + descrição em hover
 *  - "Sugerir tools" — escaneia o prompt fragment e marca tools mencionadas
 *  - Estimativa de tokens + custo aprox
 *  - Preview do prompt final (como o LLM vai ver)
 *  - Toggle público/privado (workspace)
 *
 * Mode:
 *  - "create" — campos vazios
 *  - "edit"   — pré-preenchido, slug imutável (preserva FKs do agent_skills)
 */
interface Props {
  mode: 'create' | 'edit';
  skill?: Skill;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}

const SECTORS = ['isp', 'clinica', 'ecommerce', 'imobiliaria', 'educacao', 'outros'];

const SUGGESTED_ICONS = ['🧩', '📍', '🧑‍💼', '💰', '🛠️', '🎯', '📞', '📋', '🔧', '🤝', '⚡', '🎓'];

const PROMPT_TEMPLATES: Record<string, { label: string; content: string; suggestedTools?: string[] }> = {
  empty: {
    label: 'Vazio',
    content: '',
  },
  flow: {
    label: 'Fluxo de coleta',
    content: `## Skill: {NOME_DA_SKILL}

Quando o cliente pedir {OBJETIVO}, siga este fluxo:

### 1. Coleta de dados
Pergunte na ordem:
- Dado A
- Dado B
- Dado C

Acumule do histórico — não peça dado já fornecido.

### 2. Validação
Antes de chamar a tool, garanta que tem todos os dados.

### 3. Execução
Chame \`{NOME_DA_TOOL}\` com os dados coletados.

### 4. Tratamento de resultado
- **Sucesso**: confirme com o cliente.
- **Falha técnica**: tente uma 2ª vez antes de escalar.
- **Cliente recusa fornecer dado**: explique a necessidade, escale se persistir.
`,
  },
  faq: {
    label: 'FAQ / Atendimento simples',
    content: `## Skill: {NOME_DA_SKILL}

Esta skill responde dúvidas frequentes sobre {ASSUNTO}.

### Perguntas conhecidas

**P: Pergunta 1?**
R: Resposta concisa.

**P: Pergunta 2?**
R: Resposta concisa.

### Quando NÃO responder
- Se a pergunta sai do escopo de {ASSUNTO}, transfira para o agente apropriado.
- Se você não tem certeza da resposta, escale para humano com motivo "FAQ — pergunta fora da base".
`,
  },
  error: {
    label: 'Tratamento de erro técnico',
    content: `## Skill: Tratamento de Erro Técnico

Quando uma tool retornar erro (timeout, 5xx, payload inválido):

1. **Não exponha o erro técnico ao cliente.** Mensagens tipo "Error in workflow" ou stack traces nunca aparecem.
2. **Tente novamente uma vez** com os mesmos dados.
3. Se falhar de novo, escale com motivo: "{NOME_DA_TOOL} falhou 2x — dados: <resumo>".
4. Diga ao cliente: "Vou te conectar com nosso time agora — em instantes alguém fala com você. 🙌"

NÃO tente uma 3ª vez. NÃO ofereça alternativas que você não pode fazer.
`,
    suggestedTools: ['escalar_humano'],
  },
  escalation: {
    label: 'Escalação para humano',
    content: `## Skill: Escalação para Humano

Escale para humano quando:
- Cliente pedir explicitamente ("quero falar com humano", "atendente")
- Você teve dúvida 2x seguidas no mesmo tópico
- Sentimento muito negativo / cliente irritado
- Pedido fora do seu papel (ex: cancelamento se você é vendas)

### Procedimento
1. Diga: "Vou te conectar com nosso time agora pra continuar seu atendimento. Em instantes alguém vai falar com você por aqui mesmo. 🙌"
2. Chame \`escalar_humano(motivo="<motivo curto>", prioridade="normal|alta")\`.
3. Pare de processar mensagens dessa conversa.

NUNCA combine "vou escalar" com "posso ajudar com mais alguma coisa?". A escalação encerra seu turno.
`,
    suggestedTools: ['escalar_humano'],
  },
};

/**
 * Estimativa rápida de tokens (heurística pt-BR ~3.5 chars/token).
 * Não é precisa mas dá ordem de magnitude útil pra UX.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Custo aproximado em USD. Usa preços do gpt-4o-mini (modelo barato default
 * dos workspaces atuais) — ordem de grandeza pra ajudar decisão.
 * gpt-4o-mini: $0.15/1M input tokens.
 */
function estimateCost(tokens: number): number {
  return (tokens / 1_000_000) * 0.15;
}

export function SkillFormModal({ mode, skill, onClose, onSaved }: Props) {
  const tools = useAppStore((s) => s.tools);
  const skills = useAppStore((s) => s.skills);
  const createSkill = useAppStore((s) => s.createSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);

  const [name, setName] = useState(skill?.name ?? '');
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [sector, setSector] = useState(skill?.sector ?? '');
  const [icon, setIcon] = useState(skill?.icon ?? '🧩');
  const [customIcon, setCustomIcon] = useState('');
  const [promptFragment, setPromptFragment] = useState(skill?.promptFragment ?? '');
  const [requiredTools, setRequiredTools] = useState<string[]>(skill?.requiredTools ?? []);
  const [version, setVersion] = useState(skill?.version ?? '1.0.0');
  const [isPublic, setIsPublic] = useState(skill?.isPublic ?? true);
  const [saving, setSaving] = useState(false);

  // UI state
  const [toolSearch, setToolSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('empty');

  // Auto-gera slug enquanto user digita o nome (só em create)
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

  // Tools filtradas pelo search
  const filteredTools = useMemo(() => {
    if (!toolSearch.trim()) return activeTools;
    const q = toolSearch.toLowerCase();
    return activeTools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [activeTools, toolSearch]);

  // ─── Validação de slug (inline) ───────────────────────────────────────────
  const slugStatus = useMemo((): { state: 'idle' | 'available' | 'taken' | 'invalid' | 'edit'; message: string } => {
    if (mode === 'edit') return { state: 'edit', message: 'Imutável' };
    if (!slug) return { state: 'idle', message: '' };
    if (!/^[a-z0-9-]+$/.test(slug)) return { state: 'invalid', message: 'apenas letras, números e hífen' };
    const exists = skills.find((s) => s.slug === slug);
    if (exists) return { state: 'taken', message: 'já existe' };
    return { state: 'available', message: 'disponível' };
  }, [slug, skills, mode]);

  // ─── Auto-sugestão de tools a partir do prompt ───────────────────────────
  const detectedTools = useMemo(() => {
    if (!promptFragment) return [];
    const found = new Set<string>();
    for (const t of activeTools) {
      // Procura nome da tool no prompt (case insensitive, com word boundary)
      const re = new RegExp(`\\b${t.name}\\b`, 'i');
      if (re.test(promptFragment)) found.add(t.name);
    }
    return Array.from(found);
  }, [promptFragment, activeTools]);

  const missingDetectedTools = detectedTools.filter((t) => !requiredTools.includes(t));

  const acceptDetectedTools = () => {
    setRequiredTools((curr) => Array.from(new Set([...curr, ...detectedTools])));
  };

  const toggleTool = (toolName: string) => {
    setRequiredTools((curr) =>
      curr.includes(toolName) ? curr.filter((t) => t !== toolName) : [...curr, toolName],
    );
  };

  const applyTemplate = (key: string) => {
    setSelectedTemplate(key);
    const tpl = PROMPT_TEMPLATES[key];
    if (!tpl) return;
    if (mode === 'create' || promptFragment.trim() === '') {
      setPromptFragment(tpl.content);
      if (tpl.suggestedTools) {
        setRequiredTools((curr) => Array.from(new Set([...curr, ...tpl.suggestedTools!])));
      }
    } else {
      // Em edit, confirma antes de sobrescrever
      if (confirm('Substituir o prompt atual pelo template?\n\nO conteúdo atual será perdido.')) {
        setPromptFragment(tpl.content);
        if (tpl.suggestedTools) {
          setRequiredTools((curr) => Array.from(new Set([...curr, ...tpl.suggestedTools!])));
        }
      }
    }
  };

  const handleCustomIcon = (value: string) => {
    setCustomIcon(value);
    if (value.trim()) {
      // Pega só o primeiro caractere "complete" (suporta emoji multi-codepoint)
      const first = Array.from(value)[0];
      if (first) setIcon(first);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !promptFragment.trim()) return;
    if (slugStatus.state === 'taken' || slugStatus.state === 'invalid') return;

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
  const tokenEstimate = estimateTokens(promptFragment);
  const charWarn = charCount > 2000;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
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
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1 justify-between">
                  <span className="flex items-center gap-1">
                    <Hash size={11} /> Slug *
                  </span>
                  <SlugStatusBadge status={slugStatus} />
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={mode === 'edit'}
                  pattern="[a-z0-9-]+"
                  placeholder="consulta-viabilidade-isp"
                  className={`w-full px-3 py-2 rounded-lg bg-surface-2 border text-[14px] text-creme placeholder-creme-faint font-mono focus:outline-none disabled:opacity-60 ${
                    slugStatus.state === 'taken' || slugStatus.state === 'invalid'
                      ? 'border-semantic-red focus:border-semantic-red'
                      : 'border-default focus:border-brand'
                  }`}
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
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
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
                    title="Cole qualquer emoji custom"
                  />
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

            {/* Templates de prompt */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                <FileText size={11} /> Começar de um template
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PROMPT_TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyTemplate(key)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                      selectedTemplate === key
                        ? 'bg-brand/15 text-brand-bright ring-1 ring-brand/30'
                        : 'bg-surface-2 text-creme-mute hover:text-creme hover:bg-surface-hover'
                    }`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Required tools */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint flex items-center gap-1">
                  <Wrench size={11} /> Tools requisitadas <span className="text-creme-faint normal-case font-normal">({requiredTools.length})</span>
                </label>
                {missingDetectedTools.length > 0 && (
                  <button
                    type="button"
                    onClick={acceptDetectedTools}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/10 text-brand-bright text-[11px] font-semibold hover:bg-brand/20 transition-colors"
                    title={`Detectadas no prompt: ${missingDetectedTools.join(', ')}`}
                  >
                    <Wand2 size={10} /> Sugerir {missingDetectedTools.length} do prompt
                  </button>
                )}
              </div>

              {activeTools.length === 0 ? (
                <p className="text-[12.5px] text-creme-faint italic p-3 bg-surface-2 rounded-lg border border-default">
                  Nenhuma tool ativa no sistema. Cadastre tools antes em /tools.
                </p>
              ) : (
                <>
                  {/* Search */}
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
                  {/* Grid */}
                  <div className="grid grid-cols-3 gap-1.5 max-h-[160px] overflow-y-auto p-2 bg-surface-2 rounded-lg border border-default">
                    {filteredTools.length === 0 ? (
                      <p className="text-[11.5px] text-creme-faint italic col-span-3 p-2">
                        Nenhuma tool encontrada com "{toolSearch}".
                      </p>
                    ) : (
                      filteredTools.map((t) => {
                        const checked = requiredTools.includes(t.name);
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
                  {missingDetectedTools.length === 0 && detectedTools.length > 0 && (
                    <p className="text-[11px] text-semantic-green/80 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Todas as tools mencionadas no prompt já estão marcadas
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Prompt fragment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint">
                  Prompt Fragment *
                </label>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className={charWarn ? 'text-semantic-amber' : 'text-creme-faint'}>
                    {charCount} chars · ~{tokenEstimate} tokens · ~${estimateCost(tokenEstimate).toFixed(5)}
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
                <div className="bg-surface-2 border border-default rounded-lg p-4 min-h-[240px] max-h-[400px] overflow-y-auto">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-creme-faint mb-2">
                    Preview — como o LLM vai ler:
                  </p>
                  <pre className="text-[12px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed">
                    {`[system_prompt do agent]\n[state reminder do estado atual]\n\n${promptFragment || '...prompt fragment vazio...'}`}
                  </pre>
                </div>
              ) : (
                <textarea
                  value={promptFragment}
                  onChange={(e) => setPromptFragment(e.target.value)}
                  required
                  rows={12}
                  placeholder={`## Skill: Nome da Skill\n\nQuando o cliente fornecer X:\n1. Faça Y\n2. Se falhar, faça Z\n\n...`}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand leading-relaxed resize-y min-h-[240px]"
                />
              )}

              {charWarn && (
                <p className="text-[11px] text-semantic-amber mt-1 flex items-center gap-1">
                  <AlertCircle size={10} /> Prompt fragment grande (&gt;2k chars) — pode degradar prompt cache da Anthropic
                </p>
              )}
              {!showPreview && (
                <p className="text-[11.5px] text-creme-faint mt-1">
                  Texto que será concatenado ao system_prompt do agent. Use Markdown — fica legível pro LLM. Ordem final: prompt base + state reminder + skill fragments (alfabético por slug).
                </p>
              )}
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
              disabled={
                saving ||
                !name.trim() ||
                !slug.trim() ||
                !promptFragment.trim() ||
                slugStatus.state === 'taken' ||
                slugStatus.state === 'invalid'
              }
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : mode === 'create' ? 'Criar skill' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Subcomponente: badge de status do slug ───────────────────────────────

function SlugStatusBadge({ status }: { status: { state: string; message: string } }) {
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
