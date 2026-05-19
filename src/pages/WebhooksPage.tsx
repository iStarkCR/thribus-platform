import { useEffect, useState } from 'react';
import {
  Webhook, Plus, Power, CheckCircle2, XCircle, RefreshCw,
  Copy, Send, Clock, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_WEBHOOKS, SEED_WEBHOOK_DELIVERIES,
  type OutboundWebhook, type WebhookDelivery,
} from '@/lib/seed-final';
import * as webhooksService from '@/services/webhooks';

export function WebhooksPage() {
  const [tab, setTab] = useState<'endpoints' | 'deliveries'>('endpoints');
  const [hooks, setHooks] = useState<OutboundWebhook[]>(SEED_WEBHOOKS);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>(SEED_WEBHOOK_DELIVERIES);
  const [source, setSource] = useState<'mock' | 'live'>('mock');

  useEffect(() => {
    if (!webhooksService.webhooksConfigured) return;
    Promise.allSettled([
      webhooksService.listWebhooks('ws_texnet').then((rows) => {
        if (rows.length > 0) { setHooks(rows); setSource('live'); }
      }),
      webhooksService.listDeliveries('ws_texnet', 100).then((rows) => {
        if (rows.length > 0) setDeliveries(rows);
      }),
    ]);
  }, []);

  const toggle = async (id: string) => {
    const next = !hooks.find((h) => h.id === id)?.active;
    setHooks((c) => c.map((w) => w.id === id ? { ...w, active: next } : w));
    if (source === 'live') {
      try { await webhooksService.toggleWebhook(id, next); } catch (e) { console.warn(e); }
    }
  };

  const total30d = hooks.reduce((s, h) => s + h.deliveries30d, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Webhook size={16} className="text-creme-mute" /> Webhooks Outbound
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · dispara eventos pra sistemas externos do cliente
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${hooks.length} hooks` : 'mock'}
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
          <Plus size={11} /> Novo endpoint
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <Stat label="Endpoints" value={hooks.length.toString()} />
        <Stat label="Ativos" value={hooks.filter((h) => h.active).length.toString()} color="green" />
        <Stat label="Entregas /30d" value={total30d.toLocaleString('pt-BR')} />
        <Stat label="Taxa de sucesso" value={`${(hooks.reduce((s, h) => s + h.successRate * h.deliveries30d, 0) / total30d * 100).toFixed(1)}%`} color="brand" />
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'endpoints'} onClick={() => setTab('endpoints')} label="Endpoints" count={hooks.length} />
        <TabBtn active={tab === 'deliveries'} onClick={() => setTab('deliveries')} label="Deliveries" count={deliveries.length} />
      </div>

      {tab === 'endpoints' && (
        <div className="space-y-2.5">
          {hooks.map((h) => <HookCard key={h.id} hook={h} onToggle={() => toggle(h.id)} />)}
        </div>
      )}

      {tab === 'deliveries' && (
        <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[140px_180px_1fr_100px_100px_140px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
            <div>Event</div><div>Endpoint</div><div>URL</div><div>HTTP</div><div>Status</div><div>Quando</div>
          </div>
          {deliveries.map((d) => <DeliveryRow key={d.id} delivery={d} hooks={hooks} />)}
        </div>
      )}
    </>
  );
}

function HookCard({ hook: h, onToggle }: { hook: OutboundWebhook; onToggle: () => void }) {
  return (
    <div className={clsx(
      'bg-surface-2 border rounded-[10px] p-4',
      h.active ? 'border-default' : 'border-default opacity-60',
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme">{h.label}</h4>
            <code className="text-[11px] font-mono text-creme-faint truncate">{h.url}</code>
          </div>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {h.events.map((e) => (
              <code key={e} className="text-[10.5px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-dim">{e}</code>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover" title="Testar"><Send size={12} /></button>
          <button onClick={onToggle} className={clsx('p-2 rounded-md', h.active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>
            <Power size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-default">
        <Mini label="Entregas /30d" value={h.deliveries30d.toLocaleString('pt-BR')} />
        <Mini label="Sucesso" value={`${(h.successRate * 100).toFixed(1)}%`} color={h.successRate >= 0.95 ? 'green' : h.successRate >= 0.7 ? 'amber' : 'red'} />
        <Mini label="Última" value={h.lastTriggeredAt ? new Date(h.lastTriggeredAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} />
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-default">
        <code className="text-[10.5px] font-mono text-creme-faint flex-1">Secret: {h.secret}</code>
        <button className="px-2 py-1 rounded-md text-[11px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover inline-flex items-center gap-1">
          <Copy size={10} /> Copiar
        </button>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery: d, hooks }: { delivery: WebhookDelivery; hooks: OutboundWebhook[] }) {
  const hook = hooks.find((h) => h.id === d.webhookId);
  const StatusIcon = d.status === 'success' ? CheckCircle2 : d.status === 'failed' ? XCircle : RefreshCw;
  return (
    <div className="grid grid-cols-[140px_180px_1fr_100px_100px_140px] gap-3 px-4 py-2.5 border-t border-default text-[12px] hover:bg-surface-hover/30">
      <code className="font-mono text-creme-dim text-[10.5px]">{d.event}</code>
      <div className="text-creme truncate">{hook?.label ?? '—'}</div>
      <code className="font-mono text-creme-faint text-[10.5px] truncate">{d.url}</code>
      <code className={clsx('font-mono text-[11px]', d.httpCode >= 200 && d.httpCode < 300 ? 'text-semantic-green' : 'text-semantic-red')}>{d.httpCode}</code>
      <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-mono w-fit h-fit',
        d.status === 'success' ? 'bg-semantic-green/15 text-semantic-green' :
        d.status === 'failed' ? 'bg-semantic-red/15 text-semantic-red' :
        'bg-semantic-amber/15 text-semantic-amber',
      )}>
        <StatusIcon size={9} className={d.status === 'retrying' ? 'animate-spin' : ''} />
        {d.status}
      </span>
      <span className="text-[10.5px] font-mono text-creme-faint"><Clock size={9} className="inline mr-0.5" />{new Date(d.timestamp).toLocaleString('pt-BR')}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: 'green' | 'brand' }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[20px] font-bold font-mono mt-1', color === 'green' ? 'text-semantic-green' : color === 'brand' ? 'text-brand-bright' : 'text-creme')}>{value}</div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: 'green' | 'amber' | 'red' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[13px] font-bold font-mono mt-0.5',
        color === 'green' ? 'text-semantic-green' : color === 'amber' ? 'text-semantic-amber' : color === 'red' ? 'text-semantic-red' : 'text-creme',
      )}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', active ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
      {label}
      <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{count}</span>
    </button>
  );
}
