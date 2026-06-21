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
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand/12 ring-1 ring-brand/20 flex items-center justify-center shrink-0">
            <Bot size={19} className="text-brand-bright" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[19px] font-extrabold tracking-tight text-creme leading-none">Colaboradores Digitais</h1>
            <div className="text-[12.5px] text-creme-mute mt-1">
              <span className="text-creme font-semibold">{agents.length}</span> no time · <span className="text-semantic-green font-semibold">{agents.filter((a) => a.status === 'online').length} online</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand/85 backdrop-blur-md border border-brand-bright/25 text-white text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_28px_-16px_rgba(0,0,0,0.6)] hover:bg-brand transition-colors shrink-0"
        >
          <Plus size={15} /> Novo Colaborador
        </button>
      </div>

      {/* Busca */}
      {agents.length > 0 && (
        <div className="relative mb-5 max-w-[440px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, cliente, setor ou canal…"
            className="glass-panel w-full bg-surface-2 border border-default rounded-xl pl-10 pr-3 py-2.5 text-[13.5px] text-creme placeholder-creme-faint outline-none transition-colors focus:border-brand"
          />
        </div>
      )}

      {agents.length === 0 ? (
        <div className="glass-panel bg-surface-2 border border-default rounded-2xl px-12 py-16 text-center">
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
        <div className="glass-panel bg-surface-2 border border-default rounded-2xl px-8 py-12 text-center">
          <p className="text-[13.5px] text-creme-mute">Nenhum colaborador corresponde a "{search}"</p>
        </div>
      ) : (
        <div className="space-y-10">
          {companies.map((company) => (
            <div key={company.name.toLowerCase()}>
              {/* Empresa */}
              <div className="flex items-center gap-2.5 mb-4">
                <Building2 size={16} className="text-brand-bright shrink-0" />
                <span className="text-[15px] font-bold tracking-tight text-creme">{company.name}</span>
                <span className="text-[11px] font-bold text-creme-mute bg-creme/[0.05] px-2 py-0.5 rounded-full">{company.count}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-default to-transparent ml-1" />
              </div>

              {/* Liderança (supervisores) — destaque, largura total */}
              {company.supervisors.length > 0 && (
                <div className="grid grid-cols-1 gap-3 mb-5">
                  {company.supervisors.map((a) => (
                    <AgentCard key={a.id} agent={a} showFullInfo onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
                  ))}
                </div>
              )}

              {/* Setores */}
              <div className="space-y-5 pl-0.5">
                {company.sectorGroups.map(({ sector, agents: list }) => (
                  <div key={sector?.id ?? '__none__'}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0 ring-2 ring-offset-0" style={{ backgroundColor: sector?.color ?? 'rgb(var(--creme-faint))', boxShadow: `0 0 8px ${sector?.color ?? 'transparent'}` }} />
                      <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-creme-mute">{sector?.name ?? 'Sem setor'}</span>
                      <span className="text-[10.5px] font-bold text-creme-faint bg-creme/[0.04] px-1.5 py-px rounded-full">{list.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                      {list.map((a) => (
                        <AgentCard key={a.id} agent={a} showFullInfo accent={sector?.color} onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
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
