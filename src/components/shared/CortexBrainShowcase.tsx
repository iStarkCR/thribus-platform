import { useNavigate } from 'react-router-dom';
import {
  Brain, ArrowRight, TrendingDown, TrendingUp, Sparkles, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  CORTEX_CAPABILITIES, CORTEX_METRICS, CORTEX_COMPARISON,
  type CortexMetric,
} from '@/lib/seed-marketing';

export function CortexBrainShowcase() {
  const nav = useNavigate();

  return (
    <div className="bg-gradient-to-br from-brand/10 via-surface-2 to-surface-2 border-2 border-brand/30 rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-default flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center shrink-0">
          <Brain size={26} className="text-creme" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand/20 text-brand-bright">
              Tecnologia proprietária
            </span>
            <span className="text-[10.5px] font-mono text-creme-faint">v3.2 · production</span>
          </div>
          <h2 className="text-[20px] font-bold text-creme leading-tight">
            Cortex Brain <span className="text-brand-bright">— o cérebro por trás dos seus colaboradores digitais</span>
          </h2>
          <p className="text-[13px] text-creme-mute mt-1.5 leading-relaxed">
            Motor multi-agente desenvolvido pela Thribus Tech. Não é wrapper de LLM — é uma stack
            completa que <b className="text-creme">roteia, memoriza, executa, audita e otimiza</b> em produção.
            Hoje opera <b className="text-brand-bright">15k+ conversas/mês</b> na TexNet com 91% resolução automática.
          </p>
        </div>
        <button
          onClick={() => nav('/cortex')}
          className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12.5px] font-semibold hover:bg-brand inline-flex items-center gap-1 shrink-0"
        >
          Explorar <ArrowRight size={11} />
        </button>
      </div>

      {/* Capabilities + Métricas side-by-side */}
      <div className="grid grid-cols-2 gap-px bg-default">
        {/* Capacidades */}
        <div className="p-5 bg-surface-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-creme-dim mb-3 inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-brand-bright" /> O que faz por baixo
          </h3>
          <div className="space-y-2">
            {CORTEX_CAPABILITIES.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <span className="text-[15px] leading-none shrink-0 mt-0.5">{c.icon}</span>
                <div className="flex-1">
                  <div className="text-[12.5px] font-semibold text-creme">{c.label}</div>
                  <div className="text-[11.5px] text-creme-mute leading-snug">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Métricas */}
        <div className="p-5 bg-surface-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-creme-dim mb-3 inline-flex items-center gap-1.5">
            <Zap size={11} className="text-brand-bright" /> Ganho operacional real
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CORTEX_METRICS.map((m) => <MetricCard key={m.id} metric={m} />)}
          </div>
        </div>
      </div>

      {/* Comparativo */}
      <div className="p-5 border-t border-default bg-surface-1/40">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-creme-dim mb-3">
          Operação manual vs. Cortex Brain
        </h3>
        <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_160px_100px] gap-3 px-4 py-2 border-b border-default bg-surface-1/60 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
            <div>Métrica</div>
            <div>Manual</div>
            <div className="text-brand-bright">Cortex Brain</div>
            <div className="text-right">Δ</div>
          </div>
          {CORTEX_COMPARISON.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_160px_100px] gap-3 px-4 py-2 border-t border-default text-[12.5px]">
              <div className="text-creme-mute">{c.metric}</div>
              <div className="font-mono text-creme-faint line-through opacity-70">{c.manual}</div>
              <div className="font-mono text-creme font-semibold">{c.cortex}</div>
              <div className="font-mono text-semantic-green font-bold text-right">{c.delta}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="p-5 border-t border-default flex items-center gap-3 bg-brand/5">
        <div className="flex-1">
          <div className="text-[13.5px] font-bold text-creme">
            Economia média na operação: <span className="text-semantic-green">R$ 18.400/mês</span>
          </div>
          <div className="text-[12px] text-creme-mute mt-0.5">
            (substituindo equivalente de 4 atendentes 8h por agentes Cortex 24/7 em uma operação ISP)
          </div>
        </div>
        <button
          onClick={() => nav('/optimizer')}
          className="px-3 py-1.5 rounded-md bg-surface-2 border border-default text-creme-mute hover:text-creme hover:border-hover text-[12px] font-semibold inline-flex items-center gap-1"
        >
          Rodar análise <ArrowRight size={11} />
        </button>
        <button
          onClick={() => nav('/cortex')}
          className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12.5px] font-semibold hover:bg-brand inline-flex items-center gap-1"
        >
          Ver Cortex Brain <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}

function MetricCard({ metric: m }: { metric: CortexMetric }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2.5">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{m.label}</div>
      <div className="text-[18px] font-bold font-mono text-creme mt-1 leading-tight">{m.value}</div>
      <div className="text-[10px] font-mono text-creme-faint mt-0.5 truncate">{m.baseline}</div>
      <div className={clsx(
        'text-[10.5px] font-mono font-bold mt-1 inline-flex items-center gap-0.5',
        m.positive ? 'text-semantic-green' : 'text-semantic-red',
      )}>
        {m.improvement.startsWith('-') ? <TrendingDown size={9} /> : <TrendingUp size={9} />}
        {m.improvement}
      </div>
    </div>
  );
}
