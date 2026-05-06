import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { NewAgentModal } from '@/components/agents/NewAgentModal';
import type { Agent } from '@/types';

export function AgentsPage() {
  const agents = useAppStore((s) => s.agents);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Bot size={16} className="text-creme-mute" /> Todos os Colaboradores Digitais
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>
          <Plus size={13} /> Novo Colaborador
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="bg-surface-2 border border-default rounded-[10px] px-12 py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-4">
            <Bot size={22} className="text-creme-faint" />
          </div>
          <p className="text-sm text-creme font-semibold mb-1">Nenhum colaborador digital cadastrado</p>
          <p className="text-[13.5px] text-creme-mute mb-5">
            Crie seu primeiro colaborador para começar a automatizar atendimentos.
          </p>
          <button className="btn btn-accent mx-auto" onClick={() => setShowNew(true)}>
            <Plus size={13} /> Criar primeiro colaborador
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} showFullInfo onClick={() => setSelected(a)} />
          ))}
        </div>
      )}

      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
      {showNew && <NewAgentModal onClose={() => setShowNew(false)} />}
    </>
  );
}
