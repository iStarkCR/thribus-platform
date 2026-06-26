import { useEffect, useState } from 'react';
import { Activity, Building2, Bot, AlertCircle, Loader2 } from 'lucide-react';
import { cortexAdmin, cortexAdminConfigured, type CortexAgent } from '@/services/cortexAdmin';

interface Health {
  agents: number;
  sessions: number;
}

export function CortexOverview() {
  const [health, setHealth] = useState<Health | null>(null);
  const [agents, setAgents] = useState<CortexAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [h, a] = await Promise.all([
          cortexAdmin.health(),
          cortexAdmin.listAgents().catch(() => [] as CortexAgent[]),
        ]);
        if (cancelled) return;
        setHealth({ agents: h.agents, sessions: h.sessions });
        setAgents(a);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => { if (!document.hidden) load(); }, 10_000); // não pollar em aba oculta
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!cortexAdminConfigured) return null;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Status do Brain"
          value={error ? 'OFFLINE' : health ? 'ONLINE' : '…'}
          icon={Activity}
          tone={error ? 'red' : 'green'}
        />
        <StatCard
          label="Agentes registrados"
          value={health?.agents.toString() ?? '—'}
          icon={Bot}
        />
        <StatCard
          label="Sessões ativas"
          value={health?.sessions.toString() ?? '—'}
          icon={Building2}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Erro ao consultar worker.</strong> {error}
            <div className="text-creme-faint text-[12px] mt-1">
              Confirme que <code className="font-mono">VITE_CORTEX_BASE_URL</code> aponta pra um worker rodando.
            </div>
          </div>
        </div>
      )}

      {/* Agents list */}
      <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
        <div className="px-5 py-3 border-b border-default flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-creme">Colaboradores Digitais</h3>
          {loading && <Loader2 size={14} className="text-creme-mute animate-spin" />}
        </div>
        {agents.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13.5px] text-creme-mute">
            Nenhum agente disponível.
          </div>
        ) : (
          <ul className="divide-y divide-default">
            {agents.map((a) => (
              <li key={a.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand-bright flex items-center justify-center font-bold text-[13.5px] shrink-0">
                  {a.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-creme text-[14px]">{a.name}</span>
                    <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-3 text-creme-mute">
                      {a.category}
                    </span>
                    <span className="text-[11px] font-mono text-creme-faint">v{a.version}</span>
                  </div>
                  <p className="text-[13px] text-creme-mute mt-1">{a.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {a.intents.slice(0, 6).map((i) => (
                      <span
                        key={i}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-surface-3 text-creme-faint"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  tone?: 'default' | 'green' | 'red';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
        ? 'text-red-300'
        : 'text-creme';
  return (
    <div className="rounded-xl border border-default bg-surface-1 px-5 py-4">
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider font-bold text-creme-faint">
        <Icon size={13} />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-extrabold ${toneClass}`}>{value}</div>
    </div>
  );
}
