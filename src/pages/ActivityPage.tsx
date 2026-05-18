import { useEffect, useState } from 'react';
import {
  Radio, DollarSign, MessageSquare, ArrowRight, Wrench, UserCheck,
  AlertTriangle, Settings, TrendingDown, Pause, Play, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_ACTIVITY, type ActivityType, type ActivityEvent } from '@/lib/seed-final';
import * as activity from '@/services/activity';

const TYPE_META: Record<ActivityType, { Icon: typeof Radio; color: string; bg: string }> = {
  sale_closed: { Icon: DollarSign, color: 'text-semantic-green', bg: 'bg-semantic-green/15' },
  agent_replied: { Icon: MessageSquare, color: 'text-brand-bright', bg: 'bg-brand/15' },
  escalation: { Icon: ArrowRight, color: 'text-semantic-amber', bg: 'bg-semantic-amber/15' },
  tool_executed: { Icon: Wrench, color: 'text-brand-bright', bg: 'bg-brand/15' },
  lead_qualified: { Icon: UserCheck, color: 'text-semantic-green', bg: 'bg-semantic-green/15' },
  churn_risk: { Icon: AlertTriangle, color: 'text-semantic-red', bg: 'bg-semantic-red/15' },
  config_change: { Icon: Settings, color: 'text-creme-mute', bg: 'bg-surface-3' },
  sentiment_drop: { Icon: TrendingDown, color: 'text-semantic-red', bg: 'bg-semantic-red/15' },
};

export function ActivityPage() {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [events, setEvents] = useState<ActivityEvent[]>(SEED_ACTIVITY);
  const [source, setSource] = useState<'mock' | 'live'>('mock');

  useEffect(() => {
    if (!activity.activityConfigured) return;
    activity.listRecentActivity('ws_texnet', 100)
      .then((rows) => {
        if (rows.length > 0) {
          setEvents(rows);
          setSource('live');
        }
      })
      .catch((e) => console.warn('[Activity] live falhou:', (e as Error).message));

    const unsub = activity.subscribeActivity('ws_texnet', (ev) => {
      if (paused) return;
      setEvents((curr) => [ev, ...curr].slice(0, 200));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = events.filter((e) => filter === 'all' || e.type === filter);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Radio size={16} className={clsx('text-creme-mute', !paused && 'animate-pulse')} /> Activity Feed
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · operação ao vivo · {paused ? 'pausado' : 'streaming'}
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${events.length} eventos` : 'mock'}
          </span>
        </div>
        <button onClick={() => setPaused(!paused)} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme inline-flex items-center gap-1">
          {paused ? <><Play size={11} /> Retomar</> : <><Pause size={11} /> Pausar</>}
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" count={SEED_ACTIVITY.length} />
        {(Object.keys(TYPE_META) as ActivityType[]).map((t) => {
          const c = SEED_ACTIVITY.filter((e) => e.type === t).length;
          if (c === 0) return null;
          return <FilterBtn key={t} active={filter === t} onClick={() => setFilter(t)} label={t.replace('_', ' ')} count={c} />;
        })}
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        {filtered.map((e, idx) => {
          const meta = TYPE_META[e.type];
          const Icon = meta.Icon;
          return (
            <div key={e.id} className={clsx(
              'flex items-start gap-3 px-4 py-3 border-b border-default last:border-b-0',
              idx === 0 && !paused && 'bg-brand/5',
            )}>
              <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', meta.bg, meta.color)}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-creme">{e.title}</span>
                  {e.value && <span className="text-[12px] font-bold font-mono text-brand-bright">{e.value}</span>}
                </div>
                <p className="text-[11.5px] text-creme-mute mt-0.5">{e.detail}</p>
                <div className="flex items-center gap-2 mt-1 text-[10.5px] font-mono text-creme-faint">
                  {e.agentName && <span>{e.agentName}</span>}
                  {e.agentName && e.customerName && <span>·</span>}
                  {e.customerName && <span>{e.customerName}</span>}
                  <span className="ml-auto">{new Date(e.timestamp).toLocaleTimeString('pt-BR')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function FilterBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={clsx(
      'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors',
      active ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:text-creme hover:bg-surface-hover',
    )}>
      {label}
      <span className={clsx('text-[10px] font-mono px-1 rounded-full', active ? 'bg-brand/20' : 'bg-surface-3 text-creme-faint')}>{count}</span>
    </button>
  );
}
