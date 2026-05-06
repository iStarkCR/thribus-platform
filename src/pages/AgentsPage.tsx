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

      <div className="flex flex-col gap-2.5">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} showFullInfo onClick={() => setSelected(a)} />
        ))}
      </div>

      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
      {showNew && <NewAgentModal onClose={() => setShowNew(false)} />}
    </>
  );
}
