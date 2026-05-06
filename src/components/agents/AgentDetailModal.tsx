import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ToolSelector } from '@/components/tools/ToolSelector';
import { useAppStore } from '@/hooks/useAppStore';
import type { Agent, AgentType, AIModel } from '@/types';

interface Props {
  agent: Agent;
  onClose: () => void;
}

export function AgentDetailModal({ agent, onClose }: Props) {
  // Campos editáveis
  const [name, setName] = useState(agent.name);
  const [client, setClient] = useState(agent.client);
  const [sector, setSector] = useState(agent.sector);
  const [type, setType] = useState<AgentType>(agent.type);
  const [model, setModel] = useState<AIModel>(agent.model);
  const [channel, setChannel] = useState(agent.channel ?? '');
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [tools, setTools] = useState<string[]>(agent.tools);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { updateAgent, deleteAgent, addToast } = useAppStore();

  const dirty =
    name !== agent.name ||
    client !== agent.client ||
    sector !== agent.sector ||
    type !== agent.type ||
    model !== agent.model ||
    channel !== (agent.channel ?? '') ||
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
    const confirmed = confirm(
      `Deletar o colaborador "${agent.name}"?\n\nEsta ação é PERMANENTE — todas as conversas, mensagens, execuções e escalações vinculadas a este colaborador também serão removidas.`,
    );
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
      subtitle="Edite qualquer campo abaixo e clique em Salvar"
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
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-accent" onClick={handleSave} disabled={saving || deleting || !dirty}>
            {saving ? 'Salvando...' : dirty ? 'Salvar Alterações' : 'Sem alterações'}
          </button>
        </>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-2 border border-default rounded-lg px-3 py-2.5">
            <div className="text-[11.5px] uppercase tracking-wider text-creme-faint font-semibold mb-0.5">
              {s.label}
            </div>
            <div className="text-[15px] font-bold font-mono text-creme">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Configuração */}
      <div className="mb-5">
        <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright mb-2.5">
          Configuração
        </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
                Modelo de IA
              </label>
              <select className="input" value={model} onChange={(e) => setModel(e.target.value as AIModel)}>
                <option value="claude-sonnet-4-20250514">claude-sonnet-4 (recomendado)</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rápido/barato)</option>
                <option value="claude-opus-4-6">claude-opus-4-6 (premium)</option>
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
          <p className="text-[12px] text-creme-faint -mt-1">
            Slug do canal no CRM (ex: <code className="font-mono text-brand">texnet-duall</code>). É como o webhook
            roteia mensagens deste canal para este colaborador.
          </p>
        </div>
      </div>

      {/* System Prompt */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright">
            System Prompt (treinamento)
          </div>
          <span className="text-[12px] text-creme-faint font-mono">
            {prompt.length.toLocaleString()} caracteres
          </span>
        </div>
        <textarea
          className="textarea font-mono text-[13.5px] min-h-[360px] leading-relaxed"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Identidade, comportamento, fluxo padrão, regras de escalonamento..."
        />
      </div>

      {/* Tools */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright">
            Ferramentas disponíveis
          </div>
          <span className="text-[12.5px] text-creme-faint font-mono">
            {tools.length} selecionada{tools.length === 1 ? '' : 's'}
          </span>
        </div>
        <ToolSelector client={client} selected={tools} onChange={setTools} />
      </div>
    </Modal>
  );
}
