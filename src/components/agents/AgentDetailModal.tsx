import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { ToolSelector } from '@/components/tools/ToolSelector';
import { useAppStore } from '@/hooks/useAppStore';
import type { Agent } from '@/types';

interface Props {
  agent: Agent;
  onClose: () => void;
}

export function AgentDetailModal({ agent, onClose }: Props) {
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [tools, setTools] = useState<string[]>(agent.tools);
  const [saving, setSaving] = useState(false);
  const { updateAgent, addToast } = useAppStore();

  const dirty = prompt !== agent.systemPrompt || JSON.stringify(tools) !== JSON.stringify(agent.tools);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgent(agent.id, { systemPrompt: prompt, tools });
      onClose();
    } catch {
      addToast('Erro ao salvar', 'red');
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { label: 'Status', value: agent.status === 'online' ? 'Online' : 'Standby', color: agent.status === 'online' ? 'text-semantic-green' : 'text-semantic-amber' },
    { label: 'Modelo', value: agent.model.split('-').slice(0, 2).join('-') },
    { label: 'Tools', value: String(tools.length) },
    { label: 'Hoje', value: String(agent.stats.today) },
    { label: 'Resolução', value: `${agent.stats.resolution}%` },
    { label: 'Resp. Média', value: `${agent.stats.avgResponseTime}s` },
  ];

  return (
    <Modal
      title={`${agent.name} — ${agent.client}`}
      subtitle={`Colaborador Digital ${agent.type.charAt(0).toUpperCase() + agent.type.slice(1)} · ${agent.sector}`}
      onClose={onClose}
      maxWidth="680px"
      footer={
        <>
          <button className="btn btn-danger" onClick={() => addToast('Confirme a desativação', 'amber')}>Desativar</button>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-accent" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </>
      }
    >
      {/* Info grid */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-2 border border-default rounded-lg px-3 py-2.5">
            <div className="text-[11.5px] uppercase tracking-wider text-creme-faint font-semibold mb-0.5">{s.label}</div>
            <div className={`text-[15px] font-bold font-mono ${s.color || 'text-creme'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* System Prompt */}
      <div className="mb-4">
        <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
          System Prompt (treinamento)
        </label>
        <textarea
          className="textarea font-mono text-[13.5px] min-h-[150px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {/* Tools selector */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
            Ferramentas
          </label>
          <span className="text-[12.5px] text-creme-faint font-mono">
            {tools.length} selecionada{tools.length === 1 ? '' : 's'}
          </span>
        </div>
        <ToolSelector client={agent.client} selected={tools} onChange={setTools} />
      </div>
    </Modal>
  );
}
