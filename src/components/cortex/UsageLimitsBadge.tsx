/**
 * Limites do plano (janela de 5h + semanal) — o mesmo que o /usage do Claude
 * mostra. A ponte sonda os headers anthropic-ratelimit-unified-* e grava em
 * cortex_brain_limits; aqui exibimos quanto resta de cada janela no rodapé do
 * chat, com o horário de reset. Some quando ainda não há dado (ponte nova/sem
 * token).
 */
import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { getBrainLimits, subscribeBrainLimits, type BrainLimits } from '@/services/cortexBrain';

// Mesmo formato do /usage do Claude: "Renova 23:00" (hoje) ou "Renova qua., 02:00".
function renova(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Renova ${time}`;
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }); // "qua."
  return `Renova ${wd}, ${time}`;
}

const pctOf = (u: number | null) => (u == null ? 0 : Math.round(u * 100));
const toneOf = (u: number | null, status: string | null) => {
  if (status && status !== 'allowed') return 'text-semantic-red';
  const p = pctOf(u);
  return p >= 90 ? 'text-semantic-red' : p >= 70 ? 'text-amber-400' : 'text-creme-mute';
};
const barOf = (u: number | null, status: string | null) => {
  if (status && status !== 'allowed') return 'bg-red-400';
  const p = pctOf(u);
  return p >= 90 ? 'bg-red-400' : p >= 70 ? 'bg-amber-400' : 'bg-brand';
};

function LimitRow({ label, util, reset, status }: { label: string; util: number | null; reset: string | null; status: string | null }) {
  const p = pctOf(util);
  const blocked = !!status && status !== 'allowed';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px] mb-1">
        <span className="text-creme-mute truncate">{label}</span>
        <span className="shrink-0 text-creme-faint">
          {reset && <span>{renova(reset)} </span>}
          <span className={`font-mono font-semibold ${blocked ? 'text-semantic-red' : 'text-creme-dim'}`}>{blocked ? 'esgotado' : `${p}%`}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barOf(util, status)}`} style={{ width: `${Math.max(p, 2)}%` }} />
      </div>
    </div>
  );
}

export function UsageLimitsBadge() {
  const [open, setOpen] = useState(false);
  const [lim, setLim] = useState<BrainLimits | null>(null);

  useEffect(() => {
    let on = true;
    const load = () => { getBrainLimits().then((l) => { if (on) setLim(l); }).catch(() => {}); };
    load();
    const unsub = subscribeBrainLimits(load);
    return () => { on = false; unsub(); };
  }, []);

  // Sem dado ainda (ponte antiga ou sem token OAuth) → não polui o rodapé.
  if (!lim || (lim.fiveHUtil == null && lim.sevenDUtil == null)) return null;

  // O badge mostra a janela mais "quente" das duas (a que está mais cheia).
  const five = pctOf(lim.fiveHUtil);
  const week = pctOf(lim.sevenDUtil);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] hover:bg-surface-hover transition-colors"
        title="Limites do plano — janela de 5h e semanal"
      >
        <Gauge size={13} className="text-brand-bright" />
        <span className={`font-mono ${toneOf(lim.fiveHUtil, lim.fiveHStatus)}`}>5h {five}%</span>
        <span className="text-creme-faint">·</span>
        <span className={`font-mono ${toneOf(lim.sevenDUtil, lim.sevenDStatus)}`}>sem {week}%</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-[61] w-72 rounded-xl border border-default bg-surface-1 shadow-2xl p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-creme-faint">
              <Gauge size={12} className="text-brand-bright" /> Uso do plano
            </div>
            <LimitRow label="Limite de 5 horas" util={lim.fiveHUtil} reset={lim.fiveHReset} status={lim.fiveHStatus} />
            <LimitRow label="Semanal · todos os modelos" util={lim.sevenDUtil} reset={lim.sevenDReset} status={lim.sevenDStatus} />
            <p className="text-[10.5px] text-creme-faint/80 leading-snug pt-1 border-t border-default">
              Plano Claude do time (Max), compartilhado por todos os colaboradores. Atualiza a cada ~2min.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
