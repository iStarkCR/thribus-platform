import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bot, Plus, Search, Building2, Layers, Users, ChevronDown, Network } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { NewAgentModal } from '@/components/agents/NewAgentModal';
import { OrgChart } from '@/components/agents/OrgChart';
import { listDemands, subscribeDemands, demandsConfigured, type Demand } from '@/services/demands';
import { aggregateByAgent } from '@/lib/agent-live-stats';
import type { Agent, Sector } from '@/types';

type GroupBy = 'empresa' | 'setor' | 'colaborador' | 'organograma';
type SectorLike = Pick<Sector, 'id' | 'name'> & Partial<Pick<Sector, 'color' | 'sortOrder'>>;
interface SectorGroup {
  sector: SectorLike | null;
  agents: Agent[];
}
interface CompanyGroup {
  name: string;
  count: number;
  supervisors: Agent[];
  sectorGroups: SectorGroup[];
}

const LEAD_KEY = '__leadership__';

export function AgentsPage() {
  const agents = useAppStore((s) => s.agents);
  const sectors = useAppStore((s) => s.sectors);
  const navigate = useNavigate();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [selected, setSelected] = useState<Agent | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('empresa');
  // Seções recolhidas (em memória; default tudo aberto).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const isOpen = (k: string) => !collapsed.has(k);
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Clicar no colaborador → abre o chat com ele. Engrenagem → config.
  const goToChat = (a: Agent) => navigate(`/talk?agent=${a.id}`);

  // Stats reais: agrega demandas (team_demands) por colaborador. Fallback em
  // agent.stats quando o Supabase/demandas não está configurado.
  const [demands, setDemands] = useState<Demand[]>([]);
  useEffect(() => {
    if (!demandsConfigured || !userId) return;
    listDemands(userId).then(setDemands).catch(() => {});
    return subscribeDemands(userId, () => {
      listDemands(userId).then(setDemands).catch(() => {});
    });
  }, [userId]);

  const byAgent = useMemo(() => aggregateByAgent(demands), [demands]);
  const liveFor = (id: string) => (demandsConfigured ? byAgent.get(id) ?? { open: 0, doneToday: 0, escalated: 0, active: false } : null);

  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

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
  }, [filtered, sectorById]);

  // Visão "por setor": agrupa todos os filtrados por setor (lideranças sem setor → "Liderança").
  const sectorView = useMemo<SectorGroup[]>(() => {
    const map = new Map<string, Agent[]>();
    for (const a of filtered) {
      const k = a.isSupervisor && !a.sectorId ? LEAD_KEY : a.sectorId ?? '__none__';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return Array.from(map.entries())
      .map(([sid, list]) => ({
        sector:
          sid === LEAD_KEY
            ? ({ id: LEAD_KEY, name: 'Liderança' } as SectorLike)
            : sectorById.get(sid) ?? null,
        agents: list.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.sector?.id === LEAD_KEY) return -1;
        if (b.sector?.id === LEAD_KEY) return 1;
        const ao = a.sector?.sortOrder ?? 999;
        const bo = b.sector?.sortOrder ?? 999;
        return ao !== bo ? ao - bo : (a.sector?.name ?? 'zzz').localeCompare(b.sector?.name ?? 'zzz');
      });
  }, [filtered, sectorById]);

  // Visão "por colaborador": lista plana, ordem alfabética.
  const peopleView = useMemo(() => filtered.slice().sort((a, b) => a.name.localeCompare(b.name)), [filtered]);

  const renderSector = (key: string, sector: SectorLike | null, list: Agent[]) => {
    const open = isOpen(key);
    const dot = sector?.color ?? 'rgb(var(--creme-faint))';
    return (
      <div key={key}>
        <button onClick={() => toggle(key)} className="w-full flex items-center gap-2 mb-2.5 group/sec">
          <ChevronDown size={14} className={clsx('text-creme-faint shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot, boxShadow: `0 0 8px ${sector?.color ?? 'transparent'}` }} />
          <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-creme-mute group-hover/sec:text-creme transition-colors">{sector?.name ?? 'Sem setor'}</span>
          <span className="text-[10.5px] font-bold text-creme-faint bg-creme/[0.04] px-1.5 py-px rounded-full">{list.length}</span>
        </button>
        {open && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {list.map((a) => (
              <AgentCard key={a.id} agent={a} showFullInfo accent={sector?.color} live={liveFor(a.id)} onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
            ))}
          </div>
        )}
      </div>
    );
  };

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

      {/* Busca + agrupar por */}
      {agents.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-[440px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-creme-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, cliente, setor ou canal…"
              className="glass-panel w-full bg-surface-2 border border-default rounded-xl pl-10 pr-3 py-2.5 text-[13.5px] text-creme placeholder-creme-faint outline-none transition-colors focus:border-brand"
            />
          </div>
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-surface-2 border border-default shrink-0">
            {([['empresa', 'Empresa', Building2], ['setor', 'Setor', Layers], ['colaborador', 'Colaborador', Users], ['organograma', 'Organograma', Network]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                title={`Agrupar por ${label.toLowerCase()}`}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors',
                  groupBy === key ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:text-creme hover:bg-surface-hover',
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
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
      ) : groupBy === 'organograma' ? (
        // ─── Organograma vivo (Bukowiski → setores → colaboradores) ──────────
        <OrgChart
          agents={filtered}
          sectors={sectors}
          byAgent={byAgent}
          demandsConfigured={demandsConfigured}
          onSelectAgent={goToChat}
        />
      ) : groupBy === 'colaborador' ? (
        // ─── Plano: todos os colaboradores ───────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {peopleView.map((a) => (
            <AgentCard key={a.id} agent={a} showFullInfo accent={a.sectorId ? sectorById.get(a.sectorId)?.color : undefined} live={liveFor(a.id)} onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
          ))}
        </div>
      ) : groupBy === 'setor' ? (
        // ─── Por setor (todas as empresas juntas) ────────────────────────────
        <div className="space-y-6">
          {sectorView.map(({ sector, agents: list }) => renderSector(`setor:${sector?.id ?? '__none__'}`, sector, list))}
        </div>
      ) : (
        // ─── Por empresa → liderança → setores ───────────────────────────────
        <div className="space-y-10">
          {companies.map((company) => {
            const ckey = `company:${company.name.toLowerCase()}`;
            const open = isOpen(ckey);
            return (
              <div key={ckey}>
                <button onClick={() => toggle(ckey)} className="w-full flex items-center gap-2.5 mb-4 group/co">
                  <ChevronDown size={16} className={clsx('text-creme-faint shrink-0 transition-transform', !open && '-rotate-90')} />
                  <Building2 size={16} className="text-brand-bright shrink-0" />
                  <span className="text-[15px] font-bold tracking-tight text-creme">{company.name}</span>
                  <span className="text-[11px] font-bold text-creme-mute bg-creme/[0.05] px-2 py-0.5 rounded-full">{company.count}</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-default to-transparent ml-1" />
                </button>

                {open && (
                  <>
                    {/* Liderança (supervisores) — destaque, largura total */}
                    {company.supervisors.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 mb-5">
                        {company.supervisors.map((a) => (
                          <AgentCard key={a.id} agent={a} showFullInfo live={liveFor(a.id)} onClick={() => goToChat(a)} onConfig={() => setSelected(a)} />
                        ))}
                      </div>
                    )}

                    {/* Setores */}
                    <div className="space-y-5 pl-0.5">
                      {company.sectorGroups.map(({ sector, agents: list }) => renderSector(`${ckey}:${sector?.id ?? '__none__'}`, sector, list))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
      {showNew && <NewAgentModal onClose={() => setShowNew(false)} />}
    </>
  );
}
