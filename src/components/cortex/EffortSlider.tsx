/**
 * Slider de esforço (capacidade) no efeito/formato do "Ultracode" do Claude,
 * em VERDE: trilha que enche com gradiente verde animado conforme o esforço,
 * e vira uma malha pulsante (glow) no nível máximo. Thumb branco arrastável,
 * ticks ao longo da trilha. Clica / arrasta / setas.
 */

import { useRef } from 'react';
import { clsx } from 'clsx';
import { EFFORT_LEVELS, effortIndex, type CortexEffort } from '@/services/cortexBrain';

const GRADIENT =
  'linear-gradient(90deg, rgb(var(--brand-dim)), rgb(var(--brand)), rgb(var(--brand-bright)), rgb(var(--brand)))';
// no máximo: malha pontilhada por cima do gradiente (visual "Ultracode")
const MESH =
  'radial-gradient(rgba(255,255,255,0.30) 1px, transparent 1.4px), ' +
  'linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand-bright)), rgb(var(--brand-glow)), rgb(var(--brand-bright)), rgb(var(--brand)))';

export function EffortSlider({
  value, onChange, className,
}: {
  value: CortexEffort;
  onChange: (e: CortexEffort) => void;
  className?: string;
}) {
  const idx = effortIndex(value);
  const n = EFFORT_LEVELS.length;
  const maxed = idx === n - 1;
  const pct = (idx / (n - 1)) * 100;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.round(ratio * (n - 1));
    if (i !== idx) onChange(EFFORT_LEVELS[i].value);
  };

  return (
    <div className={className}>
      <div className="flex justify-between text-[11px] text-creme-mute mb-2 px-0.5">
        <span>Mais rápido</span>
        <span>Mais inteligente</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Esforço"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={idx}
        aria-valuetext={EFFORT_LEVELS[idx].label}
        className="relative h-5 mx-2 cursor-pointer select-none outline-none touch-none"
        onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFromX(e.clientX); }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          if (e.buttons === 0) { dragging.current = false; return; } // botão soltou fora
          setFromX(e.clientX);
        }}
        onPointerUp={(e) => { dragging.current = false; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ } }}
        onPointerCancel={(e) => { dragging.current = false; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ } }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); onChange(EFFORT_LEVELS[idx - 1].value); }
          if (e.key === 'ArrowRight' && idx < n - 1) { e.preventDefault(); onChange(EFFORT_LEVELS[idx + 1].value); }
          if (e.key === 'Home') { e.preventDefault(); onChange(EFFORT_LEVELS[0].value); }
          if (e.key === 'End') { e.preventDefault(); onChange(EFFORT_LEVELS[n - 1].value); }
        }}
      >
        {/* trilha base */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-surface-3">
          {/* preenchimento verde animado (cresce com o esforço) */}
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full animate-[effort-flow_2.4s_linear_infinite] transition-[width] duration-150"
            style={{
              width: `${Math.max(pct, 6)}%`,
              backgroundImage: maxed ? MESH : GRADIENT,
              backgroundSize: maxed ? '6px 6px, 220% 100%' : '220% 100%',
              boxShadow: maxed ? '0 0 12px rgb(var(--brand-bright) / 0.55)' : 'none',
            }}
          />
        </div>
        {/* ticks */}
        {EFFORT_LEVELS.map((l, i) => (
          <span
            key={l.value}
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full',
              i <= idx ? 'bg-creme/70 w-1 h-1' : 'bg-creme-faint/40 w-1 h-1',
            )}
            style={{ left: `${(i / (n - 1)) * 100}%` }}
          />
        ))}
        {/* thumb */}
        <span
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-md bg-creme transition-[left] duration-150',
            maxed ? 'shadow-[0_0_10px_rgb(var(--brand-glow)/0.8)]' : 'shadow-[0_1px_4px_rgba(0,0,0,0.45)]',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
