import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { ToolSelector } from '@/components/tools/ToolSelector';
import { useAppStore } from '@/hooks/useAppStore';
import { agentsApi } from '@/services/api';
import type { AgentType, AIModel } from '@/types';

interface Props {
  onClose: () => void;
}

export function NewAgentModal({ onClose }: Props) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [type, setType] = useState<AgentType>('modular');
  const [model, setModel] = useState<AIModel>('claude-sonnet-4-20250514');
  const [channel, setChannel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { addToast, loadAgents } = useAppStore();

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

  return (
    <Modal
      title="Novo Colaborador Digital"
      subtitle="Configure o colaborador, treine-o e selecione suas ferramentas"
      onClose={onClose}
      maxWidth="680px"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-accent" onClick={handleCreate} disabled={loading}>
            {loading ? 'Criando...' : 'Criar Colaborador'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Nome do Colaborador</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Suporte N1 — Cliente X" />
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
    </Modal>
  );
}
