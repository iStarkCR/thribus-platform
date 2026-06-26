import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { cortexAdmin, cortexAdminConfigured, type MetricsSnapshot } from '@/services/cortexAdmin';

export function CortexMetrics() {
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await cortexAdmin.getMetrics();
      setSnap(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cortexAdminConfigured) {
      setLoading(false);
      return;
    }
    void load();
    if (!auto) return;
    const i = setInterval(() => { if (!document.hidden) load(); }, 5000); // não pollar em aba oculta
    return () => clearInterval(i);
  }, [auto]);

  if (!cortexAdminConfigured) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-4 text-creme text-[12.5px] font-bold flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Atualizar
          </button>
          <label className="flex items-center gap-2 text-[12.5px] text-creme-mute">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-brand"
            />
            Auto-refresh (5s)
          </label>
        </div>
        {snap && (
          <div className="text-[12px] text-creme-faint font-mono">
            uptime {formatUptime(snap.uptime_seconds)} · {new Date(snap.ts).toLocaleTimeString('pt-BR')}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {snap && (
        <>
          {/* Counters */}
          <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-default">
              <h3 className="text-[14px] font-bold text-creme">Contadores</h3>
            </div>
            {Object.keys(snap.counters).length === 0 ? (
              <div className="px-5 py-8 text-center text-[13.5px] text-creme-mute">
                Sem dados ainda. Faça alguns requests no Playground.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-creme-faint">
                  <tr>
                    <th className="text-left px-5 py-2.5 font-bold">Métrica</th>
                    <th className="text-right px-5 py-2.5 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {Object.entries(snap.counters)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, value]) => (
                      <tr key={name} className="hover:bg-surface-hover">
                        <td className="px-5 py-2 font-mono text-[12.5px] text-creme">{name}</td>
                        <td className="px-5 py-2 text-right font-bold text-[14px] text-brand-bright">
                          {value.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Histograms */}
          <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-default">
              <h3 className="text-[14px] font-bold text-creme">Histogramas</h3>
            </div>
            {Object.keys(snap.histograms).length === 0 ? (
              <div className="px-5 py-8 text-center text-[13.5px] text-creme-mute">
                <Activity size={28} className="mx-auto mb-2 opacity-40" />
                Sem amostras ainda.
              </div>
            ) : (
              <div className="divide-y divide-default">
                {Object.entries(snap.histograms).map(([name, h]) => (
                  <div key={name} className="px-5 py-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="font-mono text-[12.5px] text-creme">{name}</div>
                      <div className="text-[11.5px] text-creme-faint font-mono">
                        count={h.count} · avg={h.avg.toFixed(2)} · min={h.min.toFixed(2)} · max={h.max.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {Object.entries(h.buckets).map(([bucket, count]) => {
                        const pct = h.count > 0 ? (count / h.count) * 100 : 0;
                        return (
                          <div key={bucket} className="flex-1 text-center">
                            <div
                              className="bg-brand/30 rounded-sm"
                              style={{ height: `${Math.max(4, pct * 0.6)}px` }}
                              title={`${bucket}: ${count} (${pct.toFixed(1)}%)`}
                            />
                            <div className="text-[10px] text-creme-faint mt-1 font-mono">
                              {bucket}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
