import { useState } from 'react';
import { Trash2, Save, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ToolSelector } from '@/components/tools/ToolSelector';
import { useAppStore } from '@/hooks/useAppStore';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import type { Agent, AgentType, AIModel } from '@/types';
import { groupedModelOptions, isValidModel, modelLabel, safeModel } from '@/lib/models';

interface Props {
  agent: Agent;
  onClose: () => void;
}

type Tab = 'config' | 'prompt' | 'tools';

export function AgentDetailModal({ agent, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('config');

  // Campos editáveis
  const [name, setName] = useState(agent.name);
  const [client, setClient] = useState(agent.client);
  const [sector, setSector] = useState(agent.sector);
  const [type, setType] = useState<AgentType>(agent.type);
  // Sanitiza: se o agent tiver um ID legacy/inválido (ex: claude-sonnet-4-20250514
  // que parou Bianca em produção), o select renderizaria vazio e o save gravaria
  // string inválida no DB. safeModel() força fallback pro default.
  const [model, setModel] = useState<AIModel>(safeModel(agent.model));
  const modelIsLegacy = !isValidModel(agent.model);
  const [channel, setChannel] = useState(agent.channel ?? '');
  const [workspaceId, setWorkspaceId] = useState(agent.workspaceId ?? '');
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [tools, setTools] = useState<string[]>(agent.tools);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const { updateAgent, deleteAgent, addToast, workspaces } = useAppStore();

  const dirty =
    name !== agent.name ||
    client !== agent.client ||
    sector !== agent.sector ||
    type !== agent.type ||
    model !== agent.model ||
    channel !== (agent.channel ?? '') ||
    workspaceId !== (agent.workspaceId ?? '') ||
    prompt !== agent.systemPrompt ||
    JSON.stringify(tools) !== JSON.stringify(agent.tools);

  const handleSave = async () => {
    if (!name.trim() || !client.trim()) {
      addToast('Nome e cliente são obrigatórios', 'amber');
      return;
    }
    setSaving(true);
    try {
      await updateAgent(agent.id, {
        name: name.trim(),
        client: client.trim(),
        sector: sector.trim(),
        type,
        model,
        channel: channel.trim(),
        workspaceId: workspaceId || undefined,
        systemPrompt: prompt,
        tools,
      });
      onClose();
    } catch {
      addToast('Erro ao salvar', 'red');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await useAppStore.getState().askConfirm({
      title: 'Deletar colaborador',
      message: `Deletar o colaborador "${agent.name}"? É PERMANENTE — conversas, mensagens, execuções e escalações vinculadas também serão removidas.`,
      confirmLabel: 'Deletar',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteAgent(agent.id);
      onClose();
    } catch {
      addToast('Erro ao remover colaborador', 'red');
    } finally {
      setDeleting(false);
    }
  };

  const stats = [
    { label: 'Hoje', value: String(agent.stats.today) },
    { label: 'Resolução', value: `${agent.stats.resolution}%` },
    { label: 'Resp. Média', value: `${agent.stats.avgResponseTime}s` },
    { label: 'Escalações', value: String(agent.stats.escalated) },
  ];

  return (
    <Modal
      title={`${agent.name} — ${agent.client}`}
      subtitle={`Editar configuração, prompt e ferramentas do colaborador`}
      onClose={onClose}
      maxWidth="780px"
      footer={
        <>
          <button
            className="btn btn-danger mr-auto"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            <Trash2 size={13} /> {deleting ? 'Removendo...' : 'Deletar'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowSaveAsTemplate(true)}
            disabled={saving || deleting}
            title="Salvar este agente como template reutilizável"
          >
            <Save size={13} /> Salvar como template
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-accent" onClick={handleSave} disabled={saving || deleting || !dirty}>
            {saving ? 'Salvando...' : dirty ? 'Salvar Alterações' : 'Sem alterações'}
          </button>
        </>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-2 border border-default rounded-lg px-3 py-2.5">
            <div className="text-[11.5px] uppercase tracking-wider text-creme-faint font-semibold mb-0.5">
              {s.label}
            </div>
            <div className="text-[15px] font-bold font-mono text-creme">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-surface-1 border border-default rounded-lg p-0.5 mb-4 w-fit">
        {(
          [
            { id: 'config', label: 'Configuração' },
            { id: 'prompt', label: 'System Prompt' },
            { id: 'tools', label: `Ferramentas (${tools.length})` },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-surface-3 text-creme' : 'text-creme-mute hover:text-creme-dim'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'config' && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Nome
              </label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Cliente
              </label>
              <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Setor
              </label>
              <input className="input" value={sector} onChange={(e) => setSector(e.target.value)} />
            </div>
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Tipo
              </label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as AgentType)}>
                <option value="modular">Modular</option>
                <option value="operacional">Operacional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Modelo de IA
            </label>
            <select className="input" value={model} onChange={(e) => setModel(e.target.value as AIModel)}>
              <optgroup label="Anthropic Claude">
                {groupedModelOptions().anthropic.map((opt) => (
                  <option key={opt.id} value={opt.id}>{modelLabel(opt)}</option>
                ))}
              </optgroup>
              <optgroup label="OpenAI GPT">
                {groupedModelOptions().openai.map((opt) => (
                  <option key={opt.id} value={opt.id}>{modelLabel(opt)}</option>
                ))}
              </optgroup>
            </select>
            {modelIsLegacy && (
              <p className="flex items-start gap-1.5 mt-1 text-[11px] text-amber-400">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                <span>
                  Modelo salvo no banco (<code className="font-mono">{agent.model}</code>) não é mais suportado.
                  Selecionei <code className="font-mono">{model}</code> como fallback — clique em Salvar pra atualizar.
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Canal (slug do WhatsApp / inbox)
            </label>
            <input
              className="input font-mono"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="texnet-duall"
            />
            <p className="text-[12px] text-creme-faint mt-1.5">
              Slug do canal no CRM (ex: <code className="font-mono text-brand">texnet-duall</code>). É como o webhook
              roteia mensagens deste canal para este colaborador.
            </p>
          </div>

          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Workspace (cliente)
            </label>
            <select className="input" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
              <option value="">— sem workspace (usa env vars) —</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="text-[12px] text-creme-faint mt-1.5">
              Workspace define quais credenciais (LLM, CRM) o agente usa. Se vazio, usa as env vars globais.
            </p>
          </div>
        </div>
      )}

      {tab === 'prompt' && (
        <div>
          {agent.isSupervisor && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-gold/35 bg-gold/8 px-3 py-2.5 text-[12.5px] text-creme-dim">
              <span className="text-gold-bright shrink-0 mt-0.5">⚠</span>
              <span>A persona do <b>{agent.name}</b> vem de um arquivo local da ponte (<code className="font-mono text-[11.5px]">~/.claude/commands/bukowiski.md</code>). Editar aqui muda o <b>system_prompt do banco</b> — que ele <b>não usa</b>. Pra mudar a persona dele de verdade, edite o arquivo.</span>
            </div>
          )}
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
            System Prompt (treinamento)
          </label>
          <textarea
            className="textarea font-mono text-[13.5px] min-h-[420px] leading-relaxed"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Identidade, comportamento, fluxo padrão, regras de escalonamento..."
          />
          <p className="text-[12px] text-creme-faint mt-1.5">
            {prompt.length.toLocaleString()} caracteres
          </p>
        </div>
      )}

      {tab === 'tools' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
              Ferramentas disponíveis para {client || 'este cliente'}
            </label>
            <span className="text-[12.5px] text-creme-faint font-mono">
              {tools.length} selecionada{tools.length === 1 ? '' : 's'}
            </span>
          </div>
          <ToolSelector client={client} selected={tools} onChange={setTools} />
        </div>
      )}

      {showSaveAsTemplate && (
        <SaveAsTemplateModal
          agent={{
            ...agent,
            // Usa estado atual do form (não os valores originais do banco)
            // — assim user pode tunar antes de salvar template
            name,
            client,
            sector,
            type,
            model,
            channel,
            workspaceId,
            systemPrompt: prompt,
            tools,
          }}
          onClose={() => setShowSaveAsTemplate(false)}
        />
      )}
    </Modal>
  );
}
