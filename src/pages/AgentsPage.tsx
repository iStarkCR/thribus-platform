import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Search, Building2 } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { NewAgentModal } from '@/components/agents/NewAgentModal';
import type { Agent, Sector } from '@/types';

interface SectorGroup {
  sector: Sector | null;
  agents: Agent[];
}
interface CompanyGroup {
  name: string;
  count: number;
  supervisors: Agent[];
  sectorGroups: SectorGroup[];
}

export function AgentsPage() {
  const agents = useAppStore((s) => s.agents);
  const sectors = useAppStore((s) => s.sectors);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Agent | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');

  // Clicar no colaborador → abre o chat com ele. Engrenagem → config.
  const goToChat = (a: Agent) => navigate(`/talk?agent=${a.id}`);

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

  // Organograma: empresa (client) → liderança (supervisores) → setores → colaboradores.
  const companies = useMemo<CompanyGroup[]>(() => {
    const sectorById = new Map(sectors.map((s) => [s.id, s]));
    const byClient = new Map<string, { name: string; agents: Agent[] }>();
    for (const a of filtered) {
      const raw = a.client || '— sem cliente —';
      const key = raw.toLowerCase().trim();
      if (!byClient.has(key)) byClient.set(key, { name: raw, agents: [] });
      byClient.get(key)!.agents.push(a);
    }
    return Array.from(byClient.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const supervisors = c.agents.filter((a) => a.isSupervisor);
        const rest = c.agents.filter((a) => !a.isSupervisor);
        const secMap = new Map<string, Agent[]>();
        for (const a of rest) {
          const k = a.sectorId ?? '__none__';
          if (!secMap.has(k)) secMap.set(k, []);
          secMap.get(k)!.push(a);
        }
        const sectorGroups = Array.from(secMap.entries())
          .map(([sid, list]) => ({ sector: sectorById.get(sid) ?? null, agents: list }))
          .sort((a, b) => {
            const ao = a.sector?.sortOrder ?? 999;
            const bo = b.sector?.sortOrder ?? 999;
            return ao !== bo ? ao - bo : (a.sector?.name ?? 'zzz').localeCompare(b.sector?.name ?? 'zzz');
          });
        return { name: c.name, count: c.agents.length, supervisors, sectorGroups };
      });
  }, [filtered, sectors]);

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
        <div className="space-y-8">
          {companies.map((company) => (
            <div key={company.name.toLowerCase()}>
              {/* Empresa */}
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} className="text-brand" />
                <span className="text-[14px] font-bold tracking-tight text-creme">{company.name}</span>
                <span className="chip chip-muted text-[11.5px]">{company.count}</span>
                <div className="flex-1 h-px bg-default ml-2" />
              </div>

              {/* Liderança (supervisores) */}
              {company.supervisors.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {company.supervisors.map((a) => (
                      <AgentCard key={a.id} agent={a} showFullInfo onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Setores */}
              <div className="space-y-4 pl-1">
                {company.sectorGroups.map(({ sector, agents: list }) => (
                  <div key={sector?.id ?? '__none__'}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: sector?.color ?? 'var(--creme-faint, #888)' }}
                      />
                      <span className="text-[12px] font-bold uppercase tracking-wider text-creme-mute">
                        {sector?.name ?? 'Sem setor'}
                      </span>
                      <span className="chip chip-muted text-[11px]">{list.length}</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                      {list.map((a) => (
                        <AgentCard key={a.id} agent={a} showFullInfo onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
                      ))}
                    </div>
                  </div>
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
