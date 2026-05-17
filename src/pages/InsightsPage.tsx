import { useState } from 'react';
import {
  Lightbulb, MessageSquareQuote, TrendingUp, TrendingDown, AlertTriangle,
  Sparkles, Trophy, Target, Activity, ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_INSIGHTS, SEED_VOC,
  type DailyInsight, type VocTheme,
} from '@/lib/seed-extras2';

type Tab = 'insights' | 'voc';

const CATEGORY_META = {
  wins: { color: 'border-semantic-green/40 bg-semantic-green/5', text: 'text-semantic-green', Icon: Trophy },
  losses: { color: 'border-semantic-red/40 bg-semantic-red/5', text: 'text-semantic-red', Icon: TrendingDown },
  anomaly: { color: 'border-semantic-amber/40 bg-semantic-amber/5', text: 'text-semantic-amber', Icon: Activity },
  opportunity: { color: 'border-brand/40 bg-brand/5', text: 'text-brand-bright', Icon: Target },
  risk: { color: 'border-semantic-red/40 bg-semantic-red/5', text: 'text-semantic-red', Icon: AlertTriangle },
};

const VOC_CATEGORY_COLOR: Record<VocTheme['category'], string> = {
  preço: 'text-semantic-red',
  qualidade: 'text-semantic-amber',
  atendimento: 'text-semantic-green',
  cobertura: 'text-brand-bright',
  cobrança: 'text-creme-mute',
  concorrente: 'text-semantic-red',
};

export function InsightsPage() {
  const [tab, setTab] = useState<Tab>('insights');
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Lightbulb size={16} className="text-creme-mute" /> Inteligência
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · daily insights · voice of customer · prediction
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <button onClick={() => setTab('insights')} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', tab === 'insights' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
          <Sparkles size={13} /> Daily Insights
          <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', tab === 'insights' ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{SEED_INSIGHTS.length}</span>
        </button>
        <button onClick={() => setTab('voc')} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', tab === 'voc' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
          <MessageSquareQuote size={13} /> Voice of Customer
          <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', tab === 'voc' ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{SEED_VOC.length}</span>
        </button>
      </div>

      {tab === 'insights' && (
        <>
          <div className="bg-brand/5 border border-brand/20 rounded-[10px] p-4 mb-4">
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-brand-bright shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[13.5px] font-bold text-creme">Resumo gerado pelo agente · {new Date().toLocaleDateString('pt-BR')}</h3>
                <p className="text-[12.5px] text-creme-mute leading-relaxed mt-1.5">
                  Bianca quebrou recorde de fechamento ontem (+67% vs. média). Em contrapartida, <b className="text-semantic-amber">3 menções a Brisanet em retenção</b> sinalizam pressão competitiva no Centro de Bagé. Tool ixc_alterar_plano com erro alto — investigar antes de impactar mais vendas.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SEED_INSIGHTS.map((i) => <InsightCard key={i.id} insight={i} />)}
          </div>
        </>
      )}

      {tab === 'voc' && <VocPanel />}
    </>
  );
}

function InsightCard({ insight: i }: { insight: DailyInsight }) {
  const meta = CATEGORY_META[i.category];
  const Icon = meta.Icon;
  return (
    <div className={clsx('rounded-[10px] border-2 p-4', meta.color)}>
      <div className="flex items-start gap-2.5 mb-2">
        <Icon size={16} className={clsx('shrink-0 mt-0.5', meta.text)} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', meta.text, 'bg-surface-1/70')}>{i.category}</span>
            <span className={clsx(
              'text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider',
              i.impact === 'high' ? 'bg-semantic-red/15 text-semantic-red' :
              i.impact === 'medium' ? 'bg-semantic-amber/15 text-semantic-amber' :
              'bg-surface-3 text-creme-mute',
            )}>
              {i.impact} impact
            </span>
          </div>
          <h4 className="text-[14px] font-bold text-creme mt-1.5">{i.title}</h4>
        </div>
      </div>
      <p className="text-[12.5px] text-creme-mute leading-relaxed">{i.body}</p>
      {i.metric && (
        <div className={clsx('mt-2.5 text-[13px] font-bold font-mono', meta.text)}>{i.metric}</div>
      )}
      {i.recommendation && (
        <div className="mt-3 pt-3 border-t border-default flex items-start gap-1.5">
          <ChevronRight size={12} className="text-brand-bright shrink-0 mt-0.5" />
          <p className="text-[12px] text-creme leading-relaxed"><span className="text-[10.5px] uppercase tracking-wider font-bold text-brand-bright mr-1">Recomendação:</span>{i.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function VocPanel() {
  return (
    <div className="space-y-2.5">
      {SEED_VOC.map((v) => (
        <div key={v.id} className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', VOC_CATEGORY_COLOR[v.category], 'bg-surface-1')}>
                  {v.category}
                </span>
                <span className={clsx(
                  'text-[10.5px] font-mono inline-flex items-center gap-0.5',
                  v.trend > 0.1 ? 'text-semantic-red' : v.trend < -0.1 ? 'text-semantic-green' : 'text-creme-faint',
                )}>
                  {v.trend > 0 ? <TrendingUp size={10} /> : v.trend < 0 ? <TrendingDown size={10} /> : null}
                  {v.trend > 0 ? '+' : ''}{(v.trend * 100).toFixed(0)}% vs. 30d ant.
                </span>
              </div>
              <h4 className="text-[14px] font-bold text-creme">{v.theme}</h4>
              <p className="text-[12.5px] text-creme-mute italic mt-2 leading-relaxed border-l-2 border-creme-faint/30 pl-3">{v.representativeQuote}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[22px] font-bold font-mono text-creme">{v.mentions30d}</div>
              <div className="text-[10px] uppercase tracking-wider text-creme-faint">menções /30d</div>
              <div className={clsx(
                'text-[12px] font-mono mt-2',
                v.sentimentAvg > 0.3 ? 'text-semantic-green' : v.sentimentAvg < -0.2 ? 'text-semantic-red' : 'text-creme-faint',
              )}>
                sentimento {v.sentimentAvg > 0 ? '+' : ''}{v.sentimentAvg.toFixed(1)}
              </div>
              {v.affectedRevenue && (
                <div className="text-[11px] font-mono text-semantic-red mt-1">
                  R$ {v.affectedRevenue.toLocaleString('pt-BR')} em risco
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
