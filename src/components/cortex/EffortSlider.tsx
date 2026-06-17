/**
 * Slider de esforço (capacidade) no mesmo efeito/formato do Claude:
 * ticks ao longo da trilha, thumb branco arrastável, último tick em destaque,
 * labels "Mais rápido ↔ Mais inteligente". Clica/arrasta/seta pra escolher.
 */

import { useRef } from 'react';
import { clsx } from 'clsx';
import { EFFORT_LEVELS, effortIndex, type CortexEffort } from '@/services/cortexBrain';

export function EffortSlider({
  value, onChange, className,
}: {
  value: CortexEffort;
  onChange: (e: CortexEffort) => void;
  className?: string;
}) {
  const idx = effortIndex(value);
  const n = EFFORT_LEVELS.length;
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
      <div className="flex justify-between text-[11px] text-creme-mute mb-2.5 px-0.5">
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
        className="relative h-5 mx-2 cursor-pointer select-none outline-none touch-none"
        onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFromX(e.clientX); }}
        onPointerMove={(e) => { if (dragging.current) setFromX(e.clientX); }}
        onPointerUp={(e) => { dragging.current = false; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ } }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); onChange(EFFORT_LEVELS[idx - 1].value); }
          if (e.key === 'ArrowRight' && idx < n - 1) { e.preventDefault(); onChange(EFFORT_LEVELS[idx + 1].value); }
        }}
      >
        {/* trilha */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-creme-faint/25" />
        {/* ticks */}
        {EFFORT_LEVELS.map((l, i) => (
          <span
            key={l.value}
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-colors',
              i === n - 1 ? 'w-1.5 h-1.5 bg-brand' : 'w-1 h-1 bg-creme-faint/50',
            )}
            style={{ left: `${(i / (n - 1)) * 100}%` }}
          />
        ))}
        {/* thumb */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-md bg-creme shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition-[left] duration-150"
          style={{ left: `${(idx / (n - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
