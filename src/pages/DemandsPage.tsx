import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ListChecks, Plus, Loader2, Trash2, Folder, AlertTriangle, RefreshCw, Search,
  LayoutGrid, Clock, BarChart3, DollarSign, Link2,
} from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listDemands, updateDemand, deleteDemand, retryDemand, subscribeDemands,
  demandsConfigured, type Demand, type DemandStatus,
} from '@/services/demands';
import { AddDemandModal } from '@/components/demands/AddDemandModal';
import { DemandDetailModal } from '@/components/demands/DemandDetailModal';
import { RoutinesPanel } from '@/components/demands/RoutinesPanel';
import { DemandsDashboard } from '@/components/demands/DemandsDashboard';
import { priorityMeta, formatCost, dueMeta } from '@/components/demands/demandUtils';

const COLUMNS: { key: DemandStatus; label: string; dot: string; accent: string }[] = [
  { key: 'todo', label: 'A fazer · fila', dot: '#64748b', accent: 'text-creme-mute' },
  { key: 'doing', label: 'Executando', dot: '#3b82f6', accent: 'text-semantic-blue' },
  { key: 'waiting', label: 'Aguardando você', dot: '#f59e0b', accent: 'text-semantic-amber' },
  { key: 'done', label: 'Feito', dot: '#22c55e', accent: 'text-semantic-green' },
  { key: 'error', label: 'Erro', dot: '#ef4444', accent: 'text-semantic-red' },
];

type Tab = 'board' | 'routines' | 'dashboard';

export function DemandsPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const agents = useAppStore((s) => s.agents);

  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('board');
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DemandStatus | null>(null);
  const dragId = useRef<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try { setDemands(await listDemands(userId)); } catch { /* silencioso */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    listDemands(userId).then(setDemands).catch(() => {}).finally(() => setLoading(false));
    return subscribeDemands(userId, refetch);
  }, [userId, refetch]);

  const projects = useMemo(() => [...new Set(demands.map((d) => d.project).filter(Boolean))] as string[], [demands]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return demands.filter((d) => {
      if (filterAgent && d.agentId !== filterAgent) return false;
      if (filterProject && d.project !== filterProject) return false;
      if (q && !(`${d.title} ${d.description ?? ''} ${d.tags.join(' ')}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [demands, search, filterAgent, filterProject]);

  const byStatus = useMemo(() => {
    const m: Record<DemandStatus, Demand[]> = { todo: [], doing: [], waiting: [], done: [], error: [] };
    for (const d of filtered) m[d.status]?.push(d);
    return m;
  }, [filtered]);

  const waitingCount = useMemo(() => demands.filter((d) => d.status === 'waiting').length, [demands]);

  async function move(id: string, status: DemandStatus) {
    const prevStatus = demands.find((d) => d.id === id)?.status;
    // Arrastar de done/error de volta pra fila = re-rodar de verdade (zera retry/erro/custo),
    // igual ao botão "Rodar de novo" — senão re-roda sem orçamento de retry e com custo velho.
    if (status === 'todo' && (prevStatus === 'done' || prevStatus === 'error')) { void retry(id); return; }
    setDemands((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    try { await updateDemand(id, { status }); } catch { refetch(); }
  }
  async function remove(id: string) {
    setDemands((prev) => prev.filter((d) => d.id !== id));
    try { await deleteDemand(id); } catch { refetch(); }
  }
  async function retry(id: string) {
    setDemands((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'todo', error: null } : d)));
    try { await retryDemand(id); } catch { refetch(); }
  }

  if (!demandsConfigured) {
    return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado — defina <code className="font-mono text-creme">.env.local</code>.</div>;
  }

  const detail = detailId ? demands.find((d) => d.id === detailId) ?? null : null;

  return (
    <div className="p-6">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[19px] font-bold text-creme flex items-center gap-2">
            <ListChecks size={18} className="text-brand" /> Demandas do time
          </h1>
          <p className="text-[12.5px] text-creme-mute mt-0.5">
            Central de comando do time de IA. O time lê a fila <b className="text-creme">A fazer</b> e executa.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {waitingCount > 0 && (
            <button onClick={() => { setTab('board'); setFilterAgent(''); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-semantic-amber/15 text-semantic-amber text-[12.5px] font-semibold hover:bg-semantic-amber/25 transition-colors">
              <AlertTriangle size={14} /> {waitingCount} aguardando você
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors">
            <Plus size={16} /> Nova demanda
          </button>
        </div>
      </header>

      {/* Abas */}
      <div className="flex items-center gap-1 mb-4 border-b border-default">
        {([
          { id: 'board', label: 'Quadro', icon: <LayoutGrid size={14} /> },
          { id: 'routines', label: 'Rotinas', icon: <Clock size={14} /> },
          { id: 'dashboard', label: 'Painel', icon: <BarChart3 size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-brand text-creme' : 'border-transparent text-creme-mute hover:text-creme-dim'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="input pl-8 py-1.5 text-[12.5px] w-44" />
            </div>
            <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="input py-1.5 text-[12.5px] w-auto">
              <option value="">Todos colaboradores</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {projects.length > 0 && (
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input py-1.5 text-[12.5px] w-auto">
                <option value="">Todos projetos</option>
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {(search || filterAgent || filterProject) && (
              <button onClick={() => { setSearch(''); setFilterAgent(''); setFilterProject(''); }} className="text-[12px] text-creme-faint hover:text-creme">limpar</button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-creme-faint text-[13px]"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
          ) : (
            <div className="flex gap-3 min-h-[60vh] overflow-x-auto pb-2 [scrollbar-width:thin]">
              {COLUMNS.map((col) => (
                <div
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver((c) => (c === col.key ? null : c)); }}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); if (dragId.current) { move(dragId.current, col.key); dragId.current = null; } }}
                  className={`flex-1 min-w-[240px] rounded-xl border p-2.5 transition-colors ${dragOver === col.key ? 'border-brand/50 bg-brand/[0.04]' : col.key === 'waiting' && byStatus.waiting.length > 0 ? 'border-semantic-amber/30 bg-semantic-amber/[0.03]' : 'border-default bg-surface-1/40'}`}
                >
                  <div className="flex items-center justify-between px-1 pb-2.5">
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${col.accent}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} /> {col.label}
                    </div>
                    <span className="text-[11px] text-creme-faint font-mono">{byStatus[col.key].length}</span>
                  </div>
                  <div className="space-y-2">
                    {byStatus[col.key].map((d) => (
                      <DemandCard key={d.id} d={d} agentName={agentName} onOpen={() => setDetailId(d.id)} onRemove={() => remove(d.id)} onRetry={() => retry(d.id)} onDragStart={() => { dragId.current = d.id; }} />
                    ))}
                    {byStatus[col.key].length === 0 && <div className="text-[11px] text-creme-faint/60 italic px-1 py-2">—</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'routines' && userId && <RoutinesPanel userId={userId} agents={agents} />}
      {tab === 'dashboard' && <DemandsDashboard demands={demands} agentName={agentName} />}

      {addOpen && userId && (
        <AddDemandModal userId={userId} agents={agents} onClose={() => setAddOpen(false)} onCreated={(d) => { setDemands((prev) => [d, ...prev]); setAddOpen(false); }} />
      )}
      {detail && (
        <DemandDetailModal
          demand={detail}
          userId={userId}
          agents={agents}
          allDemands={demands}
          agentName={agentName}
          onClose={() => setDetailId(null)}
          onChanged={refetch}
          onDeleted={(id) => { setDetailId(null); setDemands((prev) => prev.filter((x) => x.id !== id)); }}
        />
      )}
    </div>
  );
}

function DemandCard({ d, agentName, onOpen, onRemove, onRetry, onDragStart }: {
  d: Demand; agentName: (id: string) => string; onOpen: () => void; onRemove: () => void; onRetry: () => void; onDragStart: () => void;
}) {
  const prio = priorityMeta(d.priority);
  const due = dueMeta(d.dueDate);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="group bg-surface-1 border border-default rounded-lg p-3 cursor-pointer hover:border-brand/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold text-creme leading-snug">{d.title}</div>
        <div className="flex items-center gap-0.5 shrink-0">
          {d.status === 'error' && <button onClick={(e) => { e.stopPropagation(); onRetry(); }} className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-semantic-blue" title="Rodar de novo"><RefreshCw size={13} /></button>}
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-semantic-red" title="Apagar"><Trash2 size={13} /></button>
        </div>
      </div>
      {d.description && <div className="text-[11.5px] text-creme-mute mt-1 line-clamp-2">{d.description}</div>}
      {d.status === 'done' && d.result && <div className="text-[11px] text-semantic-green/90 mt-1.5 line-clamp-2">✓ {d.result}</div>}
      {d.status === 'error' && d.error && <div className="text-[11px] text-semantic-red/90 mt-1.5 line-clamp-2 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {d.error}</div>}
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10.5px] text-creme-faint">
        <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-creme-dim font-medium">{agentName(d.agentId)}</span>
        {d.priority !== 0 && <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${prio.color}22`, color: prio.color }}>{prio.label}</span>}
        {d.project && <span className="flex items-center gap-1"><Folder size={10} /> {d.project}</span>}
        {due && <span className={due.overdue ? 'text-semantic-red font-semibold' : ''}>{due.label}</span>}
        {d.dependsOn.length > 0 && <span className="flex items-center gap-0.5" title="depende de outras"><Link2 size={10} /> {d.dependsOn.length}</span>}
        {d.status === 'done' && d.costUsd > 0 && <span className="flex items-center gap-0.5 text-gold-bright/80"><DollarSign size={10} />{formatCost(d.costUsd).replace('$', '')}</span>}
        {d.status === 'doing' && <Loader2 size={11} className="animate-spin text-semantic-blue" />}
      </div>
    </div>
  );
}
