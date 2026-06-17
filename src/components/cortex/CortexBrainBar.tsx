/**
 * Controle compacto do Cortex Brain pra usar DENTRO da conversa (igual o seletor
 * de modelo/esforço do Claude). Lê e grava a mesma config global que a ponte
 * aplica — trocar aqui muda o cérebro do time na hora.
 */

import { useEffect, useState } from 'react';
import { Brain, ChevronDown, Check, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import {
  CORTEX_BRAINS, EFFORT_LEVELS, DEFAULT_CORTEX_CONFIG, brainOf, effortIndex,
  getCortexConfig, saveCortexConfig, cortexBrainConfigured,
  type CortexBrainConfig, type CortexEffort, type CortexModel,
} from '@/services/cortexBrain';

export function CortexBrainBar({ className }: { className?: string }) {
  const [cfg, setCfg] = useState<CortexBrainConfig>(DEFAULT_CORTEX_CONFIG);
  const [open, setOpen] = useState(false);
  const brain = brainOf(cfg.model);
  const effortLabel = EFFORT_LEVELS[effortIndex(cfg.effort)].label;

  const load = () => { getCortexConfig().then(setCfg).catch(() => {}); };
  useEffect(() => { if (cortexBrainConfigured) load(); }, []);

  if (!cortexBrainConfigured) return null;

  async function update(patch: Partial<CortexBrainConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    try { await saveCortexConfig(next); } catch { /* silencioso — é só um controle rápido */ }
  }

  return (
    <div className={clsx('relative', className)}>
      <button
        onClick={() => { if (!open) load(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] hover:bg-surface-hover transition-colors"
        title="Cortex Brain — modelo e capacidade"
      >
        <Brain size={13} className="text-brand-bright" />
        <span className="font-semibold text-creme-dim">{brain.name}</span>
        {brain.effortable && <span className="text-creme-faint">· {effortLabel}</span>}
        <ChevronDown size={12} className="text-creme-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-[61] w-72 rounded-xl border border-default bg-surface-1 shadow-2xl p-2">
            <div className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">Cortex Brain</div>
            <div className="space-y-0.5">
              {CORTEX_BRAINS.map((b) => {
                const active = cfg.model === b.model;
                return (
                  <button
                    key={b.model}
                    onClick={() => update({ model: b.model as CortexModel })}
                    className={clsx(
                      'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors',
                      active ? 'bg-brand/10' : 'hover:bg-surface-hover',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-creme flex items-center gap-1.5 flex-wrap">
                        {b.name}
                        <span className="font-mono text-[10px] text-creme-faint">{b.real}</span>
                      </div>
                    </div>
                    {active && <Check size={14} className="text-brand-bright shrink-0" />}
                  </button>
                );
              })}
            </div>

            {brain.effortable ? (
              <div className="mt-2 pt-2 border-t border-default px-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">
                    <Zap size={11} /> Capacidade
                  </span>
                  <span className="text-[10.5px] text-creme-mute">{effortLabel}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={EFFORT_LEVELS.length - 1}
                  step={1}
                  value={effortIndex(cfg.effort)}
                  onChange={(e) => update({ effort: EFFORT_LEVELS[Number(e.target.value)].value as CortexEffort })}
                  className="w-full accent-brand cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-creme-faint mt-0.5">
                  <span>rápido</span><span>inteligente</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 pt-2 border-t border-default px-2 text-[10.5px] text-creme-faint">
                Capacidade ajusta só o <strong className="text-creme-mute font-semibold">Max</strong> e o{' '}
                <strong className="text-creme-mute font-semibold">Fable</strong>.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
