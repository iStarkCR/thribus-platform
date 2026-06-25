import { useMemo, useState } from 'react';
import {
  X, Save, Wand2, Tag, Hash, FileText,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { templatesApi } from '@/services/api';
import type { Agent } from '@/types';

/**
 * Modal pra salvar um agente existente como template (M1).
 *
 * Fluxo:
 *  1. Operador refina o prompt + tools de um agente (ex: Bianca/Texnet)
 *  2. Resultado provou-se em produção
 *  3. Clica em "Salvar como template" no AgentDetailModal
 *  4. Modal abre pré-preenchido com nome/setor/ícone editáveis
 *  5. **Variabilização** — opcional: substitui valores específicos do agente
 *     por placeholders (ex: "Texnet" → "{NOME_PROVEDOR}", "Bianca" → "{NOME_AGENTE}")
 *  6. Salva → entra no catálogo de templates pra criar agentes novos
 *
 * Útil pra escalar pra novos clientes — em vez de reescrever prompt do zero,
 * pega o template ajustado, substitui as variáveis, novo agente em ~10 min.
 */
interface Props {
  agent: Agent;
  onClose: () => void;
  onSaved?: () => void;
}

const SECTORS = ['isp', 'clinica', 'ecommerce', 'imobiliaria', 'educacao', 'outros'];

const SUGGESTED_ICONS = ['🎯', '🛠️', '💰', '📞', '🤝', '🎓', '🏥', '🏪', '🏘️', '✨', '⚡', '🔧'];

export function SaveAsTemplateModal({ agent, onClose, onSaved }: Props) {
  const [name, setName] = useState(`${agent.name} (template)`);
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState(agent.sector ?? 'outros');
  const [icon, setIcon] = useState('🎯');

  // Variabilização: pares "valor original" → "{PLACEHOLDER}"
  const [variabilize, setVariabilize] = useState(true);
  const [substitutions, setSubstitutions] = useState(() => {
    const subs: Array<{ from: string; to: string; enabled: boolean }> = [];
    if (agent.name) subs.push({ from: agent.name, to: '{NOME_AGENTE}', enabled: true });
    if (agent.client) subs.push({ from: agent.client, to: '{NOME_PROVEDOR}', enabled: true });
    return subs;
  });

  const [saving, setSaving] = useState(false);
  const { addToast, skills: _skills } = useAppStore();

  // Auto-gera slug a partir do nome
  useMemo(() => {
    const auto = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '')
      .slice(0, 50);
    setSlug(auto);
    return auto;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Aplica substituições ao prompt
  const previewPrompt = useMemo(() => {
    if (!variabilize) return agent.systemPrompt;
    let p = agent.systemPrompt;
    for (const sub of substitutions) {
      if (sub.enabled && sub.from && sub.to) {
        // Replace todas ocorrências (case-insensitive na keyword)
        const re = new RegExp(escapeRegex(sub.from), 'g');
        p = p.replace(re, sub.to);
      }
    }
    return p;
  }, [agent.systemPrompt, variabilize, substitutions]);

  // Conta quantas substituições rolaram pra UX
  const subsApplied = useMemo(() => {
    if (!variabilize) return 0;
    let count = 0;
    for (const sub of substitutions) {
      if (sub.enabled && sub.from) {
        const matches = agent.systemPrompt.match(new RegExp(escapeRegex(sub.from), 'g'));
        if (matches) count += matches.length;
      }
    }
    return count;
  }, [agent.systemPrompt, variabilize, substitutions]);

  const updateSub = (idx: number, patch: Partial<{ from: string; to: string; enabled: boolean }>) => {
    setSubstitutions((curr) => curr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addSub = () => {
    setSubstitutions((curr) => [...curr, { from: '', to: '', enabled: true }]);
  };

  const removeSub = (idx: number) => {
    setSubstitutions((curr) => curr.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSaving(true);
    try {
      await templatesApi.create({
        slug: slug.trim(),
        name: name.trim(),
        sector,
        description: description.trim(),
        basePrompt: previewPrompt,
        defaultTools: agent.tools,
        defaultModel: agent.model,
        icon,
        isPublic: true,
      });
      addToast(`Template "${name}" criado`, 'green');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro ao salvar template';
      addToast(msg.includes('duplicate key') ? 'Slug já existe' : msg, 'red');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Save size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">Salvar como Template</h2>
              <p className="text-[12.5px] text-creme-faint">
                Reutilizar config de <span className="text-creme-dim font-semibold">{agent.name}</span> pra criar agentes novos rápido
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
                  Nome do template *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                  <Hash size={11} /> Slug *
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  pattern="[a-z0-9-]+"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme font-mono focus:outline-none focus:border-brand"
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

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {/* Variabilização */}
            <div className="bg-surface-2 rounded-lg border border-default p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13px] font-bold text-creme flex items-center gap-1.5">
                    <Wand2 size={13} className="text-brand-bright" />
                    Variabilizar prompt
                  </div>
                  <p className="text-[11.5px] text-creme-faint mt-0.5">
                    Substitui valores específicos do agente por placeholders. Quando alguém usar esse template, vai preencher os valores na hora.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVariabilize(!variabilize)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    variabilize ? 'bg-brand' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      variabilize ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {variabilize && (
                <>
                  <div className="space-y-1.5">
                    {substitutions.map((sub, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sub.enabled}
                          onChange={(e) => updateSub(idx, { enabled: e.target.checked })}
                          className="accent-brand"
                        />
                        <input
                          type="text"
                          value={sub.from}
                          onChange={(e) => updateSub(idx, { from: e.target.value })}
                          placeholder="Texto original (ex: Texnet)"
                          className="flex-1 px-2 py-1 rounded-md bg-surface-1 border border-default text-[12px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                        />
                        <span className="text-creme-faint text-[12px]">→</span>
                        <input
                          type="text"
                          value={sub.to}
                          onChange={(e) => updateSub(idx, { to: e.target.value })}
                          placeholder="{PLACEHOLDER}"
                          className="flex-1 px-2 py-1 rounded-md bg-surface-1 border border-default text-[12px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                        />
                        <button
                          type="button"
                          onClick={() => removeSub(idx)}
                          className="w-6 h-6 rounded-md text-creme-faint hover:text-semantic-red hover:bg-semantic-red/10 transition-colors flex items-center justify-center"
                          title="Remover substituição"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={addSub}
                      className="text-[12px] text-creme-mute hover:text-creme transition-colors"
                    >
                      + Adicionar substituição
                    </button>
                    <span className="text-[11px] font-mono text-creme-faint flex items-center gap-1">
                      {subsApplied > 0 ? (
                        <>
                          <CheckCircle2 size={11} className="text-semantic-green" />
                          {subsApplied} substituição{subsApplied !== 1 ? 'ões' : ''} no prompt
                        </>
                      ) : (
                        <>
                          <AlertCircle size={11} className="text-creme-faint" />
                          nenhuma substituição encontrada
                        </>
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Tools + Model summary */}
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div className="bg-surface-2 rounded-lg border border-default p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">Modelo IA</div>
                <code className="text-[12.5px] font-mono text-creme">{agent.model}</code>
              </div>
              <div className="bg-surface-2 rounded-lg border border-default p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                  Tools default ({agent.tools.length})
                </div>
                <div className="text-[11.5px] font-mono text-creme-dim truncate" title={agent.tools.join(', ')}>
                  {agent.tools.length > 0 ? agent.tools.slice(0, 3).join(', ') + (agent.tools.length > 3 ? ` +${agent.tools.length - 3}` : '') : '—'}
                </div>
              </div>
            </div>

            {/* Preview do base_prompt */}
            <div>
              <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
                <FileText size={11} /> Preview do prompt do template
              </label>
              <pre className="bg-surface-2 border border-default rounded-lg p-3 text-[11.5px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed max-h-[280px] overflow-y-auto">
                {previewPrompt || '(vazio)'}
              </pre>
              <p className="text-[11px] text-creme-faint mt-1">
                Este é o `base_prompt` final que vai pro template. Quando alguém criar agente a partir dele, esses placeholders {variabilize ? 'precisarão ser preenchidos' : 'não existem — agente novo nasce com texto literal'}.
              </p>
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
              disabled={saving || !name.trim() || !slug.trim()}
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : <><Save size={13} /> Criar template</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
