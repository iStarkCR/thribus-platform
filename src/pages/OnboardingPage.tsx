import { useState } from 'react';
import {
  Rocket, CheckCircle2, Clock, ChevronRight,
  Building2, Plug, BookOpen, Bot, Play, Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_ONBOARDING } from '@/lib/seed-final';

const STEP_ICON = [Building2, Plug, BookOpen, Bot, Play];

export function OnboardingPage() {
  const [steps] = useState(SEED_ONBOARDING);
  const completed = steps.filter((s) => s.status === 'completed').length;
  const progress = Math.round((completed / steps.length) * 100);
  const current = steps.find((s) => s.status === 'in_progress') ?? steps.find((s) => s.status === 'pending');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Rocket size={16} className="text-creme-mute" /> Onboarding
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · 5 passos guiados pra agente em produção
          </span>
        </div>
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[16px] font-bold text-creme">Setup do workspace</h2>
            <p className="text-[12px] text-creme-mute mt-0.5">
              {completed}/{steps.length} passos completos · ~{steps.reduce((s, x) => s + x.estimatedMinutes, 0)}min total
            </p>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-bold font-mono text-brand-bright">{progress}%</div>
            <div className="text-[10px] uppercase tracking-wider text-creme-faint">progresso</div>
          </div>
        </div>
        <div className="h-2 bg-surface-1 rounded-full overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-3">
        <div className="space-y-2">
          {steps.map((s, idx) => {
            const Icon = STEP_ICON[idx];
            const isDone = s.status === 'completed';
            const isCurrent = s.status === 'in_progress';
            return (
              <div
                key={s.id}
                className={clsx(
                  'bg-surface-2 border rounded-[10px] p-4 flex items-center gap-4 transition-all',
                  isDone ? 'border-semantic-green/20 opacity-70' :
                  isCurrent ? 'border-brand/40 shadow-[0_0_20px_rgba(107,143,94,0.1)]' :
                  'border-default',
                )}
              >
                <div className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  isDone ? 'bg-semantic-green/15 text-semantic-green' :
                  isCurrent ? 'bg-brand/15 text-brand-bright' :
                  'bg-surface-3 text-creme-faint',
                )}>
                  {isDone ? <CheckCircle2 size={18} /> : <Icon size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono uppercase tracking-wider text-creme-faint">passo {s.step}</span>
                    {isCurrent && <span className="text-[10px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright inline-flex items-center gap-1"><Clock size={9} /> em andamento</span>}
                  </div>
                  <h4 className="text-[14px] font-bold text-creme mt-0.5">{s.title}</h4>
                  <p className="text-[12px] text-creme-mute leading-relaxed mt-1">{s.description}</p>
                  <div className="text-[10.5px] font-mono text-creme-faint mt-1.5">~{s.estimatedMinutes}min</div>
                </div>
                {!isDone && (
                  <button className={clsx(
                    'px-3 py-1.5 rounded-md text-[12.5px] font-semibold inline-flex items-center gap-1 shrink-0',
                    isCurrent ? 'bg-brand-dim border border-brand text-creme hover:bg-brand' : 'bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme',
                  )}>
                    {s.cta} <ChevronRight size={11} />
                  </button>
                )}
                {isDone && <CheckCircle2 size={16} className="text-semantic-green shrink-0" />}
              </div>
            );
          })}
        </div>

        <div className="bg-brand/5 border border-brand/20 rounded-[10px] p-4 h-fit sticky top-3">
          <Sparkles size={16} className="text-brand-bright mb-2" />
          <h4 className="text-[13.5px] font-bold text-creme">Próximo: {current?.title}</h4>
          <p className="text-[11.5px] text-creme-mute leading-relaxed mt-1">{current?.description}</p>
          <button className="w-full mt-3 py-2 rounded-md bg-brand-dim border border-brand text-creme text-[12.5px] font-semibold hover:bg-brand inline-flex items-center justify-center gap-1.5">
            <Play size={11} /> Continuar setup
          </button>
          <div className="mt-3 pt-3 border-t border-default text-[11px] text-creme-faint leading-relaxed">
            <b className="text-creme-mute">Precisa de ajuda?</b><br />
            Chat com nossa Bianca interna ou marca um onboarding ao vivo (gratuito · 30min).
          </div>
        </div>
      </div>
    </>
  );
}
