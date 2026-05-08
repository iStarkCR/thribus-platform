import { useEffect, useState } from 'react';
import { Sparkles, FileText } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ToolSelector } from '@/components/tools/ToolSelector';
import { useAppStore } from '@/hooks/useAppStore';
import { agentsApi, templatesApi } from '@/services/api';
import type { AgentRole, AgentTemplate, AgentType, AIModel } from '@/types';

interface Props {
  onClose: () => void;
}

const ROLE_OPTIONS: Array<{ value: AgentRole; label: string; icon: string }> = [
  { value: 'sales', label: 'Vendas', icon: '🎯' },
  { value: 'support', label: 'Suporte', icon: '🛠️' },
  { value: 'finance', label: 'Financeiro', icon: '💰' },
  { value: 'retention', label: 'Retenção', icon: '🤝' },
  { value: 'generic', label: 'Genérico', icon: '🤖' },
];

export function NewAgentModal({ onClose }: Props) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [type, setType] = useState<AgentType>('modular');
  const [role, setRole] = useState<AgentRole | ''>('');
  const [model, setModel] = useState<AIModel>('claude-sonnet-4-20250514');
  const [channel, setChannel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const { addToast, loadAgents } = useAppStore();

  useEffect(() => {
    templatesApi.list()
      .then(setTemplates)
      .catch(() => { /* silently fall back to blank — template é opcional */ });
  }, []);

  /** Aplica um template pré-pronto: preenche prompt, model e tools. */
  const applyTemplate = (t: AgentTemplate) => {
    setSelectedTemplate(t.slug);
    // Não sobrescreve nome/cliente porque são identificadores únicos do agente
    if (!prompt.trim()) setPrompt(t.basePrompt);
    setModel((t.defaultModel as AIModel) || model);
    setTools(t.defaultTools);
    addToast(`Template "${t.name}" aplicado — agora customize o prompt`, 'green');
  };

  const useBlank = () => {
    setSelectedTemplate('blank');
    setPrompt('');
    setTools([]);
  };

  const handleCreate = async () => {
    if (!name.trim() || !client.trim()) {
      addToast('Preencha nome e cliente', 'amber');
      return;
    }
    setLoading(true);
    try {
      await agentsApi.create({
        name,
        client,
        sector: 'A configurar',
        type,
        model,
        systemPrompt: prompt,
        tools,
        channel: channel.trim() || undefined,
        role: role || undefined,
      });
      await loadAgents();
      addToast('Colaborador criado', 'green');
      onClose();
    } catch {
      addToast('Erro ao criar colaborador', 'red');
    } finally {
      setLoading(false);
    }
  };

  // Antes de escolher (template ou em branco), mostra só o seletor
  const showTemplateChooser = selectedTemplate === null;

  return (
    <Modal
      title="Novo Colaborador Digital"
      subtitle={
        showTemplateChooser
          ? 'Escolha um template ou comece em branco'
          : 'Configure o colaborador, treine-o e selecione suas ferramentas'
      }
      onClose={onClose}
      maxWidth="780px"
      footer={
        showTemplateChooser ? (
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        ) : (
          <>
            <button className="btn btn-ghost mr-auto" onClick={() => setSelectedTemplate(null)}>
              ← Voltar
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-accent" onClick={handleCreate} disabled={loading}>
              {loading ? 'Criando...' : 'Criar Colaborador'}
            </button>
          </>
        )
      }
    >
      {showTemplateChooser ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-2">
            <Sparkles size={13} className="text-brand-bright" /> Templates pré-prontos
          </div>

          {templates.length === 0 ? (
            <div className="text-[13px] text-creme-faint italic px-3 py-3 bg-surface-2 border border-default rounded-lg">
              Nenhum template cadastrado ainda. Clique em "Em branco" abaixo.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-left p-4 bg-surface-2 border border-default rounded-[10px] hover:border-brand transition-all hover:bg-surface-hover"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-[26px] leading-none">{t.icon ?? '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-creme">{t.name}</div>
                      <div className="text-[11.5px] text-brand-bright uppercase tracking-wider mt-0.5">
                        {t.sector}
                      </div>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-creme-mute leading-snug line-clamp-3">
                    {t.description}
                  </p>
                  <div className="text-[11.5px] text-creme-faint font-mono mt-2">
                    {t.defaultTools.length} tool{t.defaultTools.length === 1 ? '' : 's'} · {t.defaultModel}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-default pt-3 mt-2">
            <button
              type="button"
              onClick={useBlank}
              className="w-full p-3 bg-surface-2 border border-default rounded-[10px] hover:border-hover transition-all flex items-center gap-3 text-left"
            >
              <FileText size={20} className="text-creme-faint" />
              <div>
                <div className="text-[14px] font-semibold text-creme-dim">Começar em branco</div>
                <div className="text-[12.5px] text-creme-faint">Configure tudo do zero</div>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedTemplate && selectedTemplate !== 'blank' && (
            <div className="text-[12.5px] text-brand-bright bg-brand/10 border border-brand/30 rounded-lg px-3 py-2">
              ✨ Template <span className="font-bold">{templates.find((t) => t.slug === selectedTemplate)?.name}</span> aplicado.
              Customize abaixo conforme o cliente.
            </div>
          )}

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Papel <span className="text-creme-faint normal-case font-normal">(usado pelo roteador multi-agente)</span>
            </label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as AgentRole | '')}>
              <option value="">— sem papel definido —</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.icon}  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-creme-faint mt-1">
              Quando o workspace tem roteador ativo, esse papel determina pra qual agente uma conversa é direcionada
              com base na intenção do cliente.
            </p>
          </div>

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Nome do Colaborador</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Bianca, Renata, Marcos" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Cliente</label>
              <input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Ex: Texnet" />
            </div>
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Tipo</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as AgentType)}>
                <option value="modular">Modular</option>
                <option value="operacional">Operacional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Modelo de IA</label>
              <select className="input" value={model} onChange={(e) => setModel(e.target.value as AIModel)}>
                <optgroup label="Anthropic Claude">
                  <option value="claude-sonnet-4-20250514">claude-sonnet-4 (recomendado)</option>
                  <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rápido)</option>
                  <option value="claude-opus-4-6">claude-opus-4-6 (premium)</option>
                </optgroup>
                <optgroup label="OpenAI GPT">
                  <option value="gpt-5">gpt-5</option>
                  <option value="gpt-5-mini">gpt-5-mini (rápido)</option>
                  <option value="gpt-5-nano">gpt-5-nano (mais barato)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Canal (slug)
              </label>
              <input
                className="input font-mono"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="texnet-duall"
              />
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              System Prompt (treinamento)
            </label>
            <textarea
              className="textarea font-mono text-[13.5px] min-h-[280px] leading-relaxed"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva o comportamento, identidade, fluxo padrão e regras de escalonamento do colaborador..."
            />
            {selectedTemplate && selectedTemplate !== 'blank' && prompt.includes('{') && (
              <p className="text-[12px] text-creme-faint mt-1">
                💡 Substitua os marcadores entre chaves (ex: <span className="font-mono">{'{NOME_AGENTE}'}</span>) pelos valores reais do cliente.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
                Ferramentas
              </label>
              <span className="text-[12.5px] text-creme-faint font-mono">
                {tools.length} selecionada{tools.length === 1 ? '' : 's'}
              </span>
            </div>
            <ToolSelector client={client} selected={tools} onChange={setTools} />
          </div>
        </div>
      )}
    </Modal>
  );
}
