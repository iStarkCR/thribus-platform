import { useEffect, useState } from 'react';
import {
  TestTube2, Plus, Play, Trophy, CircleDot, CheckCircle2,
  Clock, Zap, Activity,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_EXPERIMENTS,
  type Experiment, type ExperimentStatus,
} from '@/lib/seed-experiments';
import * as experimentsService from '@/services/experiments';

const STATUS_META: Record<ExperimentStatus, { label: string; color: string; Icon: typeof CircleDot }> = {
  draft: { label: 'rascunho', color: 'bg-surface-3 text-creme-mute', Icon: CircleDot },
  running: { label: 'rodando', color: 'bg-semantic-green/15 text-semantic-green', Icon: Activity },
  concluded: { label: 'concluído', color: 'bg-brand/15 text-brand-bright', Icon: CheckCircle2 },
  archived: { label: 'arquivado', color: 'bg-surface-3 text-creme-faint', Icon: Clock },
};

const METRIC_LABEL = {
  conversion: 'Taxa de conversão',
  csat: 'CSAT',
  first_response: 'Primeira resposta',
  resolution_rate: 'Taxa de resolução',
};

export function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>(SEED_EXPERIMENTS);
  const [selectedId, setSelectedId] = useState<string>(SEED_EXPERIMENTS[0]?.id ?? '');
  const [source, setSource] = useState<'mock' | 'live'>('mock');

  useEffect(() => {
    if (!experimentsService.experimentsConfigured) return;
    experimentsService.listExperiments('ws_texnet')
      .then((rows) => {
        if (rows.length > 0) {
          setExperiments(rows);
          setSource('live');
          if (!rows.find((e) => e.id === selectedId)) setSelectedId(rows[0].id);
        }
      })
      .catch((e) => console.warn('[Experiments] live falhou:', (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = experiments.find((e) => e.id === selectedId);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <TestTube2 size={16} className="text-creme-mute" /> A/B Tests
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · prompts em produção · 50/50 · vencedor com significância
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${experiments.length} experimentos` : 'mock'}
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
          <Plus size={11} /> Novo experimento
        </button>
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-3 h-[calc(100vh-160px)] min-h-[500px]">
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim">Experimentos</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {experiments.map((e) => <ExperimentRow key={e.id} experiment={e} selected={e.id === selectedId} onClick={() => setSelectedId(e.id)} />)}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          {selected ? <ExperimentDetail experiment={selected} /> : null}
        </div>
      </div>
    </>
  );
}

function ExperimentRow({ experiment: e, selected, onClick }: { experiment: Experiment; selected: boolean; onClick: () => void }) {
  const meta = STATUS_META[e.status];
  const StatusIcon = meta.Icon;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-3 rounded-lg border transition-all',
        selected ? 'bg-brand/10 border-brand/30' : 'bg-surface-1 border-default hover:border-hover hover:bg-surface-hover',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={clsx('text-[13px] font-semibold truncate flex-1', selected ? 'text-brand-bright' : 'text-creme')}>{e.name}</span>
        <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono shrink-0', meta.color)}>
          <StatusIcon size={9} className={e.status === 'running' ? 'animate-pulse' : ''} />
          {meta.label}
        </span>
      </div>
      <div className="text-[10.5px] text-creme-faint font-mono">
        {e.agentName} · {METRIC_LABEL[e.primaryMetric]}
      </div>
      {e.status !== 'draft' && (
        <div className="mt-2 pt-2 border-t border-default flex items-center justify-between text-[11px] font-mono">
          <span className="text-creme-faint">{e.totalExposures.toLocaleString('pt-BR')} exposições</span>
          {e.winner !== 'pending' && (
            <span className="text-brand-bright inline-flex items-center gap-1">
              <Trophy size={10} /> {e.winner}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function ExperimentDetail({ experiment: e }: { experiment: Experiment }) {
  const a = e.variants[0];
  const b = e.variants[1];
  const winner = e.winner === 'A' ? a : e.winner === 'B' ? b : null;
  const lift = b && a && a.conversionRate > 0 ? ((b.conversionRate - a.conversionRate) / a.conversionRate) * 100 : 0;

  return (
    <>
      <div className="p-5 border-b border-default">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-[17px] font-bold text-creme">{e.name}</h2>
            <p className="text-[12.5px] text-creme-mute mt-1 leading-relaxed italic">{e.hypothesis}</p>
            <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-creme-faint">
              <span>Agente: <span className="text-creme-dim">{e.agentName}</span></span>
              <span>·</span>
              <span>Métrica: <span className="text-creme-dim">{METRIC_LABEL[e.primaryMetric]}</span></span>
              <span>·</span>
              <span>Duração: <span className="text-creme-dim">{e.durationDays}d</span></span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {e.status === 'draft' && (
              <button className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1">
                <Play size={11} /> Iniciar
              </button>
            )}
            {winner && (
              <button className="px-3 py-1.5 rounded-md bg-semantic-green/15 text-semantic-green text-[12px] font-semibold inline-flex items-center gap-1">
                <Trophy size={11} /> Promover {e.winner}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {e.variants.map((v) => (
            <VariantCard key={v.id} variant={v} isWinner={e.winner === v.label} primaryMetric={e.primaryMetric} />
          ))}
        </div>

        {e.status === 'running' && (
          <div className="bg-surface-1 border border-default rounded-[10px] p-4">
            <h4 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-3">Estatística</h4>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Significância" value={`${(e.significance * 100).toFixed(0)}%`} subtitle={e.significance >= 0.95 ? '✓ p<0.05' : 'aguardando 95%'} />
              <Stat label="Lift relativo" value={`${lift > 0 ? '+' : ''}${lift.toFixed(1)}%`} highlight={lift > 0} />
              <Stat label="Total exposições" value={e.totalExposures.toLocaleString('pt-BR')} />
            </div>
          </div>
        )}

        {e.status === 'concluded' && winner && (
          <div className="bg-semantic-green/10 border border-semantic-green/30 rounded-[10px] p-4">
            <h4 className="text-[13px] font-bold text-semantic-green flex items-center gap-1.5 mb-2">
              <Trophy size={13} /> Vencedor: variante {e.winner}
            </h4>
            <p className="text-[12.5px] text-creme-mute leading-relaxed">
              <code className="font-mono text-brand-bright">{winner.promptVersionLabel}</code> superou a alternativa com significância de {(e.significance * 100).toFixed(0)}%
              em {e.totalExposures.toLocaleString('pt-BR')} exposições. Lift de {lift > 0 ? '+' : ''}{lift.toFixed(1)}%.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function VariantCard({ variant: v, isWinner, primaryMetric }: { variant: Experiment['variants'][0]; isWinner: boolean; primaryMetric: Experiment['primaryMetric'] }) {
  return (
    <div className={clsx(
      'bg-surface-1 border rounded-[10px] p-4',
      isWinner ? 'border-semantic-green/50 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'border-default',
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-brand/15 text-brand-bright text-[12px] font-bold font-mono">{v.label}</span>
            {isWinner && <Trophy size={13} className="text-semantic-green" />}
          </div>
          <code className="text-[11px] font-mono text-creme-mute mt-1.5 block">{v.promptVersionLabel}</code>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">Tráfego</div>
          <div className="text-[14px] font-bold font-mono text-creme">{v.trafficShare}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 pb-3 border-b border-default">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">Exposições</div>
          <div className="text-[16px] font-bold font-mono text-creme mt-0.5">{v.exposures.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{METRIC_LABEL[primaryMetric]}</div>
          <div className={clsx('text-[16px] font-bold font-mono mt-0.5', isWinner ? 'text-semantic-green' : 'text-creme')}>
            {(v.conversionRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] font-mono text-creme-faint">
        <span><Zap size={9} className="inline mr-1" />{v.avgLatencyMs}ms avg</span>
        <span>US$ {v.avgCost.toFixed(3)}/exp</span>
      </div>
    </div>
  );
}

function Stat({ label, value, subtitle, highlight }: { label: string; value: string; subtitle?: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[20px] font-bold font-mono mt-1', highlight ? 'text-semantic-green' : 'text-creme')}>{value}</div>
      {subtitle && <div className="text-[10.5px] text-creme-faint font-mono mt-0.5">{subtitle}</div>}
    </div>
  );
}
