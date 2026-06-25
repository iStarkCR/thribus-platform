import { useMemo, useState } from 'react';
import {
  X, Network, Bot, Zap, FileText, Plus, Trash2,
  Loader2, Eye, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Workspace, RouterConfig, AgentRole } from '@/types';

/**
 * RouterConfigModal — UI visual pro `workspace.router_config` (M2).
 *
 * Sem isso, configurar roteamento multi-agente exigia editar jsonb cru
 * no Supabase SQL Editor. Agora:
 *  - Toggle ON/OFF (router_config.enabled)
 *  - Seletor de modelo IA pra classificação (gpt-4o-mini default — barato)
 *  - Editor de router_prompt (com template default que funciona out-of-box)
 *  - Mapping intent → agent_id (cards com seletor de agent dentre os do workspace)
 *  - Fallback agent (default quando classificador falha/ambíguo)
 *  - Preview do JSON final pra debug
 *
 * Sai daqui pronto pra worker M2 já consumir — não precisa redeploy
 * (worker lê router_config a cada turno).
 */
interface Props {
  workspace: Workspace;
  onClose: () => void;
}

const CLASSIFIER_MODELS = [
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini', cost: '$0.15/1M', recommended: true },
  { value: 'gpt-5-nano', label: 'gpt-5-nano', cost: '$0.10/1M' },
  { value: 'gpt-5-mini', label: 'gpt-5-mini', cost: '$0.25/1M' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5', cost: '$1/1M' },
];

const KNOWN_INTENTS: Array<{ key: string; label: string; description: string; suggestedRole: AgentRole }> = [
  { key: 'sales', label: 'Vendas', description: 'Cliente quer contratar plano novo, fazer upgrade', suggestedRole: 'sales' },
  { key: 'support', label: 'Suporte', description: 'Cliente com problema técnico, sem internet, lentidão', suggestedRole: 'support' },
  { key: 'finance', label: 'Financeiro', description: 'Boleto, pagamento, débitos, mudança de forma de pagamento', suggestedRole: 'finance' },
  { key: 'retention', label: 'Retenção', description: 'Cliente quer cancelar — última tentativa de manter', suggestedRole: 'retention' },
  { key: 'generic', label: 'Genérico', description: 'Pergunta geral ou dúvida não classificável', suggestedRole: 'generic' },
];

const DEFAULT_PROMPT = `Você é um classificador de intenção. Dado uma mensagem inicial de cliente, decida pra qual agente roteá-la.

Intents disponíveis:
- sales: cliente quer contratar plano novo, fazer upgrade, perguntar sobre serviço
- support: problema técnico (sem internet, lentidão, erro no app)
- finance: boleto, pagamento, débitos, segunda via, forma de pagamento
- retention: cliente quer cancelar serviço
- generic: qualquer outra coisa

Responda APENAS com o JSON: {"intent": "sales|support|finance|retention|generic", "confidence": 0.0-1.0, "reasoning": "breve"}`;

export function RouterConfigModal({ workspace, onClose }: Props) {
  const agents = useAppStore((s) => s.agents);
  const updateWorkspace = useAppStore((s) => s.updateWorkspace);

  // Filtra agents do workspace ativo
  const workspaceAgents = useMemo(
    () => agents.filter((a) => a.workspaceId === workspace.id),
    [agents, workspace.id],
  );

  const initial = workspace.routerConfig ?? {
    enabled: false,
    model: 'gpt-4o-mini',
    router_prompt: DEFAULT_PROMPT,
    intents: {},
    fallback_agent_id: workspaceAgents[0]?.id,
  };

  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model ?? 'gpt-4o-mini');
  const [routerPrompt, setRouterPrompt] = useState(initial.router_prompt ?? DEFAULT_PROMPT);
  const [intents, setIntents] = useState<Record<string, string>>(initial.intents ?? {});
  const [fallbackAgentId, setFallbackAgentId] = useState(
    initial.fallback_agent_id ?? workspaceAgents[0]?.id ?? '',
  );
  const [customIntentKey, setCustomIntentKey] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const setIntent = (key: string, agentId: string) => {
    setIntents((curr) => {
      const next = { ...curr };
      if (agentId) next[key] = agentId;
      else delete next[key];
      return next;
    });
  };

  const removeIntent = (key: string) => {
    setIntents((curr) => {
      const next = { ...curr };
      delete next[key];
      return next;
    });
  };

  const addCustomIntent = () => {
    const key = customIntentKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key || intents[key]) return;
    setIntents((curr) => ({ ...curr, [key]: workspaceAgents[0]?.id ?? '' }));
    setCustomIntentKey('');
  };

  // Preview do JSON final que vai pro DB
  const finalConfig: RouterConfig = useMemo(() => ({
    enabled,
    model,
    router_prompt: routerPrompt,
    intents,
    fallback_agent_id: fallbackAgentId || undefined,
  }), [enabled, model, routerPrompt, intents, fallbackAgentId]);

  // Validação
  const intentCount = Object.keys(intents).length;
  const isValid = !enabled || (intentCount > 0 && fallbackAgentId);

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, { routerConfig: finalConfig });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Network size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">Roteador Multi-Agente (M2)</h2>
              <p className="text-[12.5px] text-creme-faint">
                Workspace <span className="text-creme-dim font-semibold">{workspace.name}</span> · {workspaceAgents.length} agentes disponíveis
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

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Empty state se workspace não tem agents */}
            {workspaceAgents.length === 0 && (
              <div className="p-4 rounded-lg bg-semantic-amber/5 border border-semantic-amber/30 flex items-start gap-2">
                <AlertCircle size={14} className="text-semantic-amber shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-creme mb-0.5">
                    Workspace sem agentes
                  </div>
                  <div className="text-[12px] text-creme-faint">
                    Adicione pelo menos 2 agentes a este workspace antes de configurar roteamento. Sem múltiplos agentes, o router não tem pra onde rotear.
                  </div>
                </div>
              </div>
            )}

            {/* Toggle principal */}
            <div className="flex items-center justify-between p-4 bg-surface-2 rounded-lg border border-default">
              <div>
                <div className="text-[14px] font-bold text-creme flex items-center gap-1.5">
                  <Zap size={14} className="text-brand-bright" />
                  Habilitar roteamento multi-agente
                </div>
                <p className="text-[11.5px] text-creme-faint mt-1 max-w-[400px]">
                  Quando ligado, a 1ª mensagem da conversa é classificada por LLM e direcionada pro agente certo. Custa ~50 tokens extras por classificação.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                disabled={workspaceAgents.length === 0}
                className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
                  enabled ? 'bg-brand' : 'bg-surface-3'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Conteúdo só aparece se enabled */}
            {enabled && workspaceAgents.length > 0 && (
              <>
                {/* Modelo classificador */}
                <div>
                  <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                    Modelo classificador
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CLASSIFIER_MODELS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setModel(m.value)}
                        className={`text-left p-2.5 rounded-lg border transition-all relative ${
                          model === m.value
                            ? 'bg-brand/10 border-brand/30'
                            : 'bg-surface-2 border-default hover:border-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <code className="text-[12px] font-mono text-creme">{m.label}</code>
                          {m.recommended && (
                            <span className="text-[9px] uppercase tracking-wider font-bold text-brand-bright">
                              recomendado
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-creme-faint">{m.cost} input</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Router prompt */}
                <div>
                  <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <FileText size={11} /> Prompt de classificação
                    </span>
                    <button
                      type="button"
                      onClick={() => setRouterPrompt(DEFAULT_PROMPT)}
                      className="normal-case font-normal text-creme-mute hover:text-creme transition-colors"
                    >
                      Resetar pro default
                    </button>
                  </label>
                  <textarea
                    value={routerPrompt}
                    onChange={(e) => setRouterPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand leading-relaxed resize-y"
                  />
                  <p className="text-[11px] text-creme-faint mt-1">
                    O LLM deve responder JSON com `{'{"intent":"...","confidence":0..1}'}`. As intents possíveis devem bater com os mapeamentos abaixo.
                  </p>
                </div>

                {/* Intents → Agents */}
                <div>
                  <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-2 flex items-center gap-1">
                    <Bot size={11} /> Mapeamento intent → agente <span className="text-creme-faint normal-case font-normal">({intentCount})</span>
                  </label>

                  <div className="space-y-1.5">
                    {KNOWN_INTENTS.map((kw) => {
                      const currentAgentId = intents[kw.key];
                      const suggestedAgent = workspaceAgents.find((a) => a.role === kw.suggestedRole);
                      return (
                        <IntentRow
                          key={kw.key}
                          intentKey={kw.key}
                          label={kw.label}
                          description={kw.description}
                          agentId={currentAgentId ?? ''}
                          agents={workspaceAgents}
                          suggestedAgentId={suggestedAgent?.id}
                          onChange={(agentId) => setIntent(kw.key, agentId)}
                        />
                      );
                    })}

                    {/* Custom intents (não nas conhecidas) */}
                    {Object.keys(intents).filter((k) => !KNOWN_INTENTS.find((kw) => kw.key === k)).map((key) => (
                      <IntentRow
                        key={key}
                        intentKey={key}
                        label={key}
                        description="Intent custom"
                        agentId={intents[key]}
                        agents={workspaceAgents}
                        onChange={(agentId) => setIntent(key, agentId)}
                        onRemove={() => removeIntent(key)}
                        custom
                      />
                    ))}
                  </div>

                  {/* Adicionar intent custom */}
                  <div className="flex items-center gap-2 mt-2 p-2 bg-surface-2 rounded-lg border border-dashed border-default">
                    <input
                      type="text"
                      value={customIntentKey}
                      onChange={(e) => setCustomIntentKey(e.target.value)}
                      placeholder="Intent custom (ex: agendamento, segunda_via)"
                      className="flex-1 px-2 py-1 rounded-md bg-surface-1 border border-default text-[12px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={addCustomIntent}
                      disabled={!customIntentKey.trim()}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand/10 text-brand-bright text-[11px] font-semibold hover:bg-brand/20 transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} /> Adicionar
                    </button>
                  </div>
                </div>

                {/* Fallback agent */}
                <div>
                  <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">
                    Fallback (quando classificação falha ou retorna intent não mapeada)
                  </label>
                  <select
                    value={fallbackAgentId}
                    onChange={(e) => setFallbackAgentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[13px] text-creme focus:outline-none focus:border-brand"
                  >
                    <option value="">— escolha um agente —</option>
                    {workspaceAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.role ? ` (${a.role})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview JSON */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-creme-mute hover:text-creme transition-colors"
                  >
                    <Eye size={12} /> {showPreview ? 'Esconder' : 'Ver'} JSON final
                  </button>
                  {showPreview && (
                    <pre className="mt-2 bg-surface-2 border border-default rounded-lg p-3 text-[11px] font-mono text-creme-dim overflow-x-auto">
                      {JSON.stringify(finalConfig, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Validação */}
                {!isValid && (
                  <div className="p-3 rounded-lg bg-semantic-red/5 border border-semantic-red/30 text-[12px] text-semantic-red flex items-start gap-2">
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <div>
                      Pra ligar o roteador você precisa: pelo menos 1 mapeamento intent → agente <strong>E</strong> um fallback agent definido.
                    </div>
                  </div>
                )}

                {isValid && (
                  <div className="p-3 rounded-lg bg-semantic-green/5 border border-semantic-green/30 text-[12px] text-semantic-green flex items-start gap-2">
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                    <div>
                      Pronto pra salvar. Após salvar, a próxima conversa nova já passa pelo roteador.
                    </div>
                  </div>
                )}
              </>
            )}
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
            type="button"
            onClick={handleSave}
            disabled={saving || !isValid}
            className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── IntentRow ─────────────────────────────────────────────────────────────

function IntentRow({
  intentKey, label, description, agentId, agents, suggestedAgentId, onChange, onRemove, custom,
}: {
  intentKey: string;
  label: string;
  description: string;
  agentId: string;
  agents: Array<{ id: string; name: string; role?: string }>;
  suggestedAgentId?: string;
  onChange: (agentId: string) => void;
  onRemove?: () => void;
  custom?: boolean;
}) {
  const isMapped = !!agentId;
  return (
    <div className={`p-2.5 rounded-lg border transition-colors ${
      isMapped ? 'bg-brand/5 border-brand/20' : 'bg-surface-2 border-default'
    }`}>
      <div className="grid grid-cols-[1fr_2fr_auto] gap-3 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <code className="text-[12px] font-mono font-semibold text-creme">{intentKey}</code>
            {custom && <span className="text-[9px] uppercase tracking-wider text-creme-faint">custom</span>}
          </div>
          <div className="text-[11px] text-creme-faint truncate" title={description}>
            {label} — {description}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={agentId}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-2 py-1 rounded-md bg-surface-1 border border-default text-[12px] text-creme focus:outline-none focus:border-brand"
          >
            <option value="">— não rotear —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.role ? ` (${a.role})` : ''}{a.id === suggestedAgentId ? ' ⭐' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="w-7 h-7 rounded-md text-creme-faint hover:text-semantic-red hover:bg-semantic-red/10 transition-colors flex items-center justify-center"
            >
              <Trash2 size={11} />
            </button>
          ) : (
            <span className="block w-7" />
          )}
        </div>
      </div>
    </div>
  );
}
