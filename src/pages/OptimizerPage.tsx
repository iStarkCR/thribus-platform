import { useState } from 'react';
import {
  Gauge, Sparkles, RefreshCw, CheckCircle2, ChevronRight, TrendingUp,
  Layers, Zap, FileCode, Wrench, Scissors,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_OPTIMIZATIONS, type OptimizationRecommendation } from '@/lib/seed-final';

const TYPE_META = {
  model_swap: { Icon: Layers, label: 'Troca de modelo' },
  cache_increase: { Icon: Zap, label: 'Aumento de cache' },
  prompt_compress: { Icon: FileCode, label: 'Compressão de prompt' },
  tool_dedup: { Icon: Wrench, label: 'Remoção de tools dormentes' },
  context_trim: { Icon: Scissors, label: 'Redução de contexto' },
};

export function OptimizerPage() {
  const [recs, setRecs] = useState<OptimizationRecommendation[]>(SEED_OPTIMIZATIONS);
  const apply = (id: string) => setRecs((c) => c.map((r) => r.id === id ? { ...r, applied: true } : r));

  const totalSavings = recs.filter((r) => !r.applied).reduce((s, r) => s + r.estimatedSavingsMonthly, 0);
  const applied = recs.filter((r) => r.applied);
  const appliedSavings = applied.reduce((s, r) => s + r.estimatedSavingsMonthly, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Gauge size={16} className="text-creme-mute" /> AI Cost Optimizer
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · análise automática · recomendações com impacto quantificado
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme inline-flex items-center gap-1">
          <RefreshCw size={11} /> Rodar análise
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="bg-brand/10 border-2 border-brand/30 rounded-[10px] p-4">
          <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">
            <Sparkles size={12} className="text-brand-bright" /> Economia disponível
          </div>
          <div className="text-[26px] font-bold font-mono text-brand-bright mt-1">R$ {totalSavings.toLocaleString('pt-BR')}<span className="text-[14px]">/mês</span></div>
          <p className="text-[11px] text-creme-mute mt-1">se aplicar todas {recs.filter((r) => !r.applied).length} recomendações pendentes</p>
        </div>
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">Já aplicadas</div>
          <div className="text-[20px] font-bold font-mono text-semantic-green mt-1">R$ {appliedSavings}<span className="text-[12px]">/mês</span></div>
          <p className="text-[11px] text-creme-faint mt-1">{applied.length} otimizações</p>
        </div>
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">Custo atual /mês</div>
          <div className="text-[20px] font-bold font-mono text-creme mt-1">US$ 2.502<span className="text-[12px]"></span></div>
          <p className="text-[11px] text-creme-faint mt-1">após otimizações: ~US$ 1.842</p>
        </div>
      </div>

      <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Recomendações</h3>
      <div className="space-y-2.5">
        {recs.map((r) => <RecCard key={r.id} rec={r} onApply={() => apply(r.id)} />)}
      </div>
    </>
  );
}

function RecCard({ rec: r, onApply }: { rec: OptimizationRecommendation; onApply: () => void }) {
  const meta = TYPE_META[r.type];
  const Icon = meta.Icon;
  return (
    <div className={clsx(
      'bg-surface-2 border rounded-[10px] p-4',
      r.applied ? 'border-semantic-green/30 opacity-70' : 'border-default hover:border-hover',
    )}>
      <div className="flex items-start gap-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', r.applied ? 'bg-semantic-green/15 text-semantic-green' : 'bg-brand/15 text-brand-bright')}>
          {r.applied ? <CheckCircle2 size={16} /> : <Icon size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme">{r.agentName}</h4>
            <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-dim uppercase tracking-wider">{meta.label}</span>
            {r.applied && <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green">aplicada</span>}
          </div>

          <div className="grid grid-cols-[1fr_24px_1fr] gap-3 mt-3 items-center">
            <div className="bg-surface-1 border border-default rounded-md p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint mb-1">Atual</div>
              <code className="text-[11px] font-mono text-creme-mute">{r.current}</code>
            </div>
            <ChevronRight size={14} className="text-brand-bright mx-auto" />
            <div className="bg-brand/5 border border-brand/30 rounded-md p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-brand-bright mb-1">Recomendado</div>
              <code className="text-[11px] font-mono text-creme">{r.recommended}</code>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-default">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">Economia /mês</div>
              <div className="text-[15px] font-bold font-mono text-semantic-green mt-0.5 inline-flex items-center gap-1">
                <TrendingUp size={11} /> R$ {r.estimatedSavingsMonthly.toLocaleString('pt-BR')}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">Impacto qualidade</div>
              <div className={clsx(
                'text-[15px] font-bold font-mono mt-0.5',
                r.qualityImpact >= 0 ? 'text-semantic-green' : r.qualityImpact >= -0.03 ? 'text-creme' : 'text-semantic-amber',
              )}>
                {r.qualityImpact >= 0 ? '+' : ''}{(r.qualityImpact * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">Confiança</div>
              <div className="text-[15px] font-bold font-mono text-creme mt-0.5">{(r.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>

        {!r.applied && (
          <button onClick={onApply} className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1 shrink-0 self-start">
            Aplicar <ChevronRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
