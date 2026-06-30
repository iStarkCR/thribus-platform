/**
 * "Carga do Cortex Brain" — uso real do time no chat, branded (não os limites da
 * Anthropic, que não saem por API). Mostra custo/execuções/tokens + o teto como
 * barra de limite. Abre num popover a partir do chat.
 */
import { useEffect, useState } from 'react';
import { Activity, BrainCircuit, ArrowRight } from 'lucide-react';
import { getUsageSummary, getCortexConfig, type UsageSummary, type CortexBrainConfig } from '@/services/cortexBrain';

const money = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function Gauge({ label, value, max, right, accent }: { label: string; value: number; max: number; right: string; accent?: 'warn' | 'hot' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = accent === 'hot' || pct >= 90 ? 'bg-red-400' : accent === 'warn' || pct >= 70 ? 'bg-amber-400' : 'bg-brand';
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] mb-1">
        <span className="text-creme-mute">{label}</span>
        <span className="text-creme-faint font-mono">{right}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

export function CortexUsageBadge() {
  const [open, setOpen] = useState(false);
  const [u, setU] = useState<UsageSummary | null>(null);
  const [cfg, setCfg] = useState<CortexBrainConfig | null>(null);

  const load = () => {
    getUsageSummary().then(setU).catch(() => {});
    getCortexConfig().then(setCfg).catch(() => {});
  };
  useEffect(() => { if (open) load(); }, [open]);

  const budget = cfg?.monthlyBudgetUsd ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
        title="Carga do Cortex Brain"
      >
        <Activity size={13} className="text-brand-bright" />
        Uso
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-[61] w-72 rounded-xl border border-default bg-surface-1 shadow-2xl p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit size={15} className="text-brand-bright" />
              <span className="text-[13px] font-bold text-creme">Carga do Cortex Brain</span>
            </div>

            {!u ? (
              <div className="text-[12px] text-creme-faint py-2">Carregando…</div>
            ) : (
              <div className="space-y-3">
                {budget > 0 ? (
                  <>
                    <Gauge label="Teto do mês" value={u.costMonth} max={budget} right={`${money(u.costMonth)} / ${money(budget)}`} />
                    <Gauge label="Hoje" value={u.costToday} max={budget / 30} right={money(u.costToday)} />
                    <Gauge label="Esta semana" value={u.cost7d} max={budget / 4.3} right={money(u.cost7d)} />
                  </>
                ) : (
                  <div className="rounded-lg bg-surface-2 border border-default p-2.5 space-y-1.5">
                    <Row label="Custo · mês" value={money(u.costMonth)} />
                    <Row label="Custo · hoje" value={money(u.costToday)} />
                    <Row label="Custo · 7 dias" value={money(u.cost7d)} />
                    <a href="#/cortex-brain" className="flex items-center gap-1 text-[11px] text-brand-bright pt-1">Defina um teto pra ver como limite <ArrowRight size={11} /></a>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-default">
                  <Stat label="Execuções" value={String(u.executions)} />
                  <Stat label="Tokens" value={compact(u.totalTokens)} />
                  <Stat label="Tempo méd." value={u.avgDurationMs ? `${Math.round(u.avgDurationMs / 1000)}s` : '—'} />
                </div>

                {u.byModel.length > 0 && (
                  <div className="pt-1 border-t border-default">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-creme-faint mb-1">Por cérebro</div>
                    {u.byModel.slice(0, 3).map((m) => (
                      <div key={m.model} className="flex justify-between text-[11.5px]">
                        <span className="text-creme-mute font-mono">{m.model}</span>
                        <span className="text-creme-faint font-mono">{money(m.cost)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-creme-faint/80 leading-snug pt-1 border-t border-default">
                  Uso real do seu time (30d). Os limites de assinatura do Claude (5h/semanal) são da Anthropic.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-[11.5px]"><span className="text-creme-mute">{label}</span><span className="text-creme-dim font-mono">{value}</span></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[14px] font-extrabold text-creme tracking-tight">{value}</div>
      <div className="text-[9.5px] text-creme-faint">{label}</div>
    </div>
  );
}
