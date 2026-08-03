/**
 * Controle compacto do Cortex Brain pra usar DENTRO da conversa (igual o seletor
 * de modelo/esforço do Claude). A escolha é POR conversa: lê/grava o override da
 * sessão (chat_sessions.model_override/effort_override). Sem override → AUTO
 * (roteador decide por mensagem). Trocar aqui só afeta ESTA conversa.
 */

import { useEffect, useState } from 'react';
import { Brain, ChevronDown, Check, Zap, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import {
  CORTEX_BRAINS, EFFORT_LEVELS, brainOf, effortIndex,
  getSessionOverride, saveSessionOverride, cortexBrainConfigured,
  type CortexModel, type CortexEffort,
} from '@/services/cortexBrain';
import { EffortSlider } from '@/components/cortex/EffortSlider';

interface BarState {
  mode: 'auto' | 'manual';
  model: CortexModel;
  effort: CortexEffort;
}

const DEFAULT_BAR: BarState = { mode: 'auto', model: 'opus', effort: 'high' };

export function CortexBrainBar({ className, sessionId }: { className?: string; sessionId?: string | null }) {
  const [state, setState] = useState<BarState>(DEFAULT_BAR);
  const [open, setOpen] = useState(false);
  const isAuto = state.mode === 'auto';
  const brain = brainOf(state.model);
  const effortLabel = EFFORT_LEVELS[effortIndex(state.effort)].label;
  const locked = !sessionId; // sem sessão criada (chat novo) → só AUTO, sem escolha manual

  const load = () => {
    if (!sessionId) { setState(DEFAULT_BAR); return; }
    getSessionOverride(sessionId)
      .then((o) => setState({ mode: o.mode, model: o.model ?? DEFAULT_BAR.model, effort: o.effort ?? DEFAULT_BAR.effort }))
      .catch(() => {});
  };
  useEffect(() => { if (cortexBrainConfigured) load(); }, [sessionId]);

  if (!cortexBrainConfigured) return null;

  async function update(patch: Partial<BarState>) {
    if (!sessionId) return; // chat novo sem sessão: ignora o clique, não trava a UI
    const next = { ...state, ...patch };
    setState(next);
    try {
      await saveSessionOverride(sessionId, next.mode === 'manual'
        ? { mode: 'manual', model: next.model, effort: next.effort }
        : { mode: 'auto' });
    } catch { /* silencioso — é só um controle rápido */ }
  }

  return (
    <div className={clsx('relative', className)}>
      <button
        onClick={() => { if (!open) load(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] hover:bg-surface-hover transition-colors"
        title={locked ? 'Cortex Brain — envie a primeira mensagem pra escolher o modelo desta conversa' : 'Cortex Brain — modelo e capacidade desta conversa'}
      >
        {isAuto ? <Sparkles size={13} className="text-brand-bright" /> : <Brain size={13} className="text-brand-bright" />}
        <span className="font-semibold text-creme-dim">{isAuto ? 'Cortex Brain Auto' : brain.name}</span>
        {!isAuto && brain.effortable && <span className="text-creme-faint">· {effortLabel}</span>}
        <ChevronDown size={12} className="text-creme-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-[61] w-72 rounded-xl border border-default bg-surface-1 shadow-2xl p-2">
            <div className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">Cortex Brain</div>
            {locked && (
              <div className="px-1.5 pb-1.5 text-[10.5px] text-creme-faint">
                Envie a primeira mensagem pra escolher o modelo desta conversa.
              </div>
            )}
            <div className={clsx('space-y-0.5', locked && 'opacity-50 pointer-events-none')}>
              <button
                onClick={() => update({ mode: 'auto' })}
                className={clsx(
                  'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors',
                  isAuto ? 'bg-brand/10' : 'hover:bg-surface-hover',
                )}
              >
                <Sparkles size={13} className={isAuto ? 'text-brand-bright shrink-0' : 'text-creme-faint shrink-0'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-creme flex items-center gap-1.5">
                    Cortex Brain Auto
                    <span className="font-mono text-[10px] text-creme-faint">roteia por mensagem</span>
                  </div>
                </div>
                {isAuto && <Check size={14} className="text-brand-bright shrink-0" />}
              </button>
              {CORTEX_BRAINS.map((b) => {
                const active = !isAuto && state.model === b.model;
                return (
                  <button
                    key={b.model}
                    onClick={() => update({ mode: 'manual', model: b.model as CortexModel })}
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

            {!isAuto && brain.effortable ? (
              <div className={clsx('mt-2 pt-2.5 border-t border-default px-2 pb-1', locked && 'opacity-50 pointer-events-none')}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Zap size={12} className="text-brand-bright" />
                  <span className="text-[12px] text-creme-mute">Esforço</span>
                  <span className="text-[12px] font-bold text-creme">{effortLabel}</span>
                </div>
                <EffortSlider value={state.effort} onChange={(e) => update({ effort: e })} />
              </div>
            ) : (
              <div className="mt-2 pt-2 border-t border-default px-2 text-[10.5px] text-creme-faint">
                {isAuto
                  ? 'Auto: o roteador escolhe o modelo por mensagem.'
                  : <>Capacidade ajusta só o <strong className="text-creme-mute font-semibold">Max</strong> e o{' '}<strong className="text-creme-mute font-semibold">Fable</strong>.</>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
