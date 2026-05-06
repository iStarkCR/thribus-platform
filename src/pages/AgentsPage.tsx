import { useState, useMemo } from 'react';
import { Bot, Plus, Search, Building2 } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { NewAgentModal } from '@/components/agents/NewAgentModal';
import type { Agent } from '@/types';

export function AgentsPage() {
  const agents = useAppStore((s) => s.agents);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');

  // Filtra por busca
  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.client.toLowerCase().includes(q) ||
        a.sector.toLowerCase().includes(q) ||
        (a.channel ?? '').toLowerCase().includes(q),
    );
  }, [agents, search]);

  // Agrupa por cliente (case-insensitive — Texnet e TexNet caem no mesmo grupo)
  const grouped = useMemo(() => {
    // mapeia a chave normalizada → { displayName, agents[] }
    const map = new Map<string, { name: string; agents: Agent[] }>();
    for (const a of filtered) {
      const raw = a.client || '— sem cliente —';
      const key = raw.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { name: raw, agents: [] });
      }
      map.get(key)!.agents.push(a);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Bot size={16} className="text-creme-mute" /> Todos os Colaboradores Digitais
          <span className="ml-2 chip chip-muted">{agents.length}</span>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>
          <Plus size={13} /> Novo Colaborador
        </button>
      </div>

      {/* Busca */}
      {agents.length > 0 && (
        <div className="relative mb-4 max-w-[420px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, cliente, setor ou canal..."
            className="input pl-9"
          />
        </div>
      )}

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
      ) : filtered.length === 0 ? (
        <div className="bg-surface-2 border border-default rounded-[10px] px-8 py-12 text-center">
          <p className="text-[13.5px] text-creme-mute">Nenhum colaborador corresponde a "{search}"</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ name, agents: list }) => (
            <div key={name.toLowerCase()}>
              <div className="flex items-center gap-2 mb-2.5">
                <Building2 size={14} className="text-creme-faint" />
                <span className="text-[13px] font-bold uppercase tracking-wider text-creme-mute">
                  {name}
                </span>
                <span className="chip chip-muted text-[11.5px]">{list.length}</span>
                <div className="flex-1 h-px bg-default ml-2" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {list.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    showFullInfo
                    onClick={() => setSelected(a)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
      {showNew && <NewAgentModal onClose={() => setShowNew(false)} />}
    </>
  );
}
