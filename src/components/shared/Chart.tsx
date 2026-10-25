/**
 * Gráficos leves (sem lib) pro chat — bloco ```chart. Renderiza bar (barras
 * horizontais), line (linha + área) e donut (rosca + legenda), tematizados com
 * as CSS vars do painel. Dados: { type, title?, unit?, data: [{label,value,color?}] }.
 */
import type { ReactNode } from 'react';

export interface ChartPoint { label: string; value: number; color?: string }
export interface ChartSpec { type?: 'bar' | 'line' | 'donut' | 'pie'; title?: string; unit?: string; data: ChartPoint[] }

// Paleta tematizada (CSS vars) — cicla quando há mais séries que cores.
const PALETTE = ['--brand-bright', '--gold-bright', '--semantic-blue', '--semantic-amber', '--semantic-red', '--brand', '--semantic-green'];
const colorAt = (i: number, explicit?: string) => explicit ? explicit : `rgb(var(${PALETTE[i % PALETTE.length]}))`;

// 1.2k / 3.4M / inteiro — com unidade opcional (R$, %, …).
function fmt(n: number, unit?: string): string {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : abs >= 1000 ? `${(n / 1000).toFixed(abs >= 1e4 ? 0 : 1)}k` : String(Math.round(n * 100) / 100);
  if (!unit) return s;
  return unit === '%' ? `${s}%` : `${unit} ${s}`;
}

function Frame({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="my-3 rounded-2xl border border-default/60 bg-surface-1/40 px-4 py-3.5 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.65)]">
      {title && <div className="text-[11px] uppercase tracking-[0.1em] text-creme-faint font-semibold mb-3">{title}</div>}
      {children}
    </div>
  );
}

function BarChart({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2.5 text-[12.5px]">
          <span className="w-[30%] shrink-0 truncate text-right text-creme-mute">{d.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-surface-3/70 overflow-hidden">
            <div className="h-full w-full rounded-full origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.max(0.02, Math.abs(d.value) / max)})`, background: colorAt(i, d.color) }} />
          </div>
          <span className="w-[16%] shrink-0 text-right font-mono tabular-nums text-creme font-medium">{fmt(d.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const W = 520, H = 180, padL = 8, padR = 8, padT = 12, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = data.map((d) => d.value);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const x = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / span) * innerH;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${padL},${padT + innerH} ${pts} ${padL + innerW},${padT + innerH}`;
  const stroke = 'rgb(var(--brand-bright))';
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand-bright))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--brand-bright))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#lineFill)" />
        <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill={stroke} />)}
      </svg>
      <div className="flex justify-between text-[10px] text-creme-faint mt-1 font-mono">
        {data.map((d, i) => <span key={i} className="truncate" style={{ maxWidth: `${100 / data.length}%` }}>{d.label}</span>)}
      </div>
      <div className="text-[10.5px] text-creme-faint mt-1">máx {fmt(max, unit)} · mín {fmt(min, unit)}</div>
    </div>
  );
}

function DonutChart({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0) || 1;
  const R = 60, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 150 150" className="w-[130px] h-[130px] shrink-0 -rotate-90">
        <circle cx="75" cy="75" r={R} fill="none" stroke="rgb(var(--surface-3))" strokeWidth="18" />
        {data.map((d, i) => {
          const frac = Math.abs(d.value) / total;
          const seg = <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={colorAt(i, d.color)} strokeWidth="18" strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C} />;
          acc += frac;
          return seg;
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 text-[12.5px]">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorAt(i, d.color) }} />
            <span className="flex-1 min-w-0 truncate text-creme-mute">{d.label}</span>
            <span className="font-mono tabular-nums text-creme font-medium shrink-0">{fmt(d.value, unit)}</span>
            <span className="font-mono text-creme-faint shrink-0 w-10 text-right">{Math.round((Math.abs(d.value) / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const data = (spec.data || []).filter((d) => d && typeof d.value === 'number');
  if (!data.length) return null;
  const type = spec.type === 'pie' ? 'donut' : (spec.type || 'bar');
  return (
    <Frame title={spec.title}>
      {type === 'line' ? <LineChart data={data} unit={spec.unit} />
        : type === 'donut' ? <DonutChart data={data} unit={spec.unit} />
        : <BarChart data={data} unit={spec.unit} />}
    </Frame>
  );
}
