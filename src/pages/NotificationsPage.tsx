import { useState } from 'react';
import {
  Bell, CheckCircle2, AlertTriangle, MessageSquare, Zap, CreditCard,
  Megaphone, Settings as SettingsIcon, Check, ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_NOTIFICATIONS, type AppNotification, type NotifKind } from '@/lib/seed-final';

const KIND_META: Record<NotifKind, { Icon: typeof Bell; color: string; label: string }> = {
  system: { Icon: SettingsIcon, color: 'text-creme-mute', label: 'Sistema' },
  approval: { Icon: CheckCircle2, color: 'text-brand-bright', label: 'Aprovação' },
  alert: { Icon: AlertTriangle, color: 'text-semantic-amber', label: 'Alerta' },
  mention: { Icon: MessageSquare, color: 'text-semantic-green', label: '@menção' },
  workflow: { Icon: Zap, color: 'text-brand-bright', label: 'Workflow' },
  billing: { Icon: CreditCard, color: 'text-semantic-amber', label: 'Billing' },
  announcement: { Icon: Megaphone, color: 'text-semantic-green', label: 'Novidade' },
};

export function NotificationsPage() {
  const [notifs, setNotifs] = useState<AppNotification[]>(SEED_NOTIFICATIONS);
  const [filter, setFilter] = useState<'all' | 'unread' | NotifKind>('all');

  const filtered = notifs.filter((n) =>
    filter === 'all' ? true :
    filter === 'unread' ? !n.read :
    n.kind === filter
  );

  const unread = notifs.filter((n) => !n.read).length;
  const markAllRead = () => setNotifs((c) => c.map((n) => ({ ...n, read: true })));
  const toggleRead = (id: string) => setNotifs((c) => c.map((n) => n.id === id ? { ...n, read: !n.read } : n));

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Bell size={16} className="text-creme-mute" /> Notificações
          {unread > 0 && (
            <span className="text-[11px] font-mono px-1.5 py-px rounded-full bg-semantic-red/15 text-semantic-red">{unread} não lidas</span>
          )}
        </div>
        <button onClick={markAllRead} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme inline-flex items-center gap-1">
          <Check size={11} /> Marcar todas como lidas
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="Todas" count={notifs.length} />
        <FilterBtn active={filter === 'unread'} onClick={() => setFilter('unread')} label="Não lidas" count={unread} highlight />
        {(Object.keys(KIND_META) as NotifKind[]).map((k) => {
          const c = notifs.filter((n) => n.kind === k).length;
          if (c === 0) return null;
          return <FilterBtn key={k} active={filter === k} onClick={() => setFilter(k)} label={KIND_META[k].label} count={c} />;
        })}
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] divide-y divide-default overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-creme-faint">Nenhuma notificação nesse filtro.</div>
        ) : filtered.map((n) => {
          const meta = KIND_META[n.kind];
          const Icon = meta.Icon;
          return (
            <div key={n.id} className={clsx('flex items-start gap-3 px-4 py-3', !n.read && 'bg-brand/5')}>
              <div className={clsx('w-8 h-8 rounded-full bg-surface-1 border border-default flex items-center justify-center shrink-0', meta.color)}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-creme">{n.title}</span>
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-semantic-red" />}
                  <span className="text-[10.5px] font-mono text-creme-faint">{KIND_META[n.kind].label}</span>
                </div>
                <p className="text-[12px] text-creme-mute mt-0.5 leading-relaxed">{n.body}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10.5px] font-mono text-creme-faint">
                  <span>{new Date(n.timestamp).toLocaleString('pt-BR')}</span>
                  {n.source && <span>· {n.source}</span>}
                  {n.href && <span className="text-brand-bright inline-flex items-center gap-0.5"><ExternalLink size={9} /> {n.href}</span>}
                </div>
              </div>
              <button onClick={() => toggleRead(n.id)} className="text-[11px] text-creme-faint hover:text-creme shrink-0">
                {n.read ? 'marcar não lida' : 'marcar lida'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function FilterBtn({ active, onClick, label, count, highlight }: { active: boolean; onClick: () => void; label: string; count: number; highlight?: boolean }) {
  return (
    <button onClick={onClick} className={clsx(
      'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors',
      active ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:text-creme hover:bg-surface-hover',
    )}>
      {label}
      <span className={clsx('text-[10px] font-mono px-1 rounded-full', highlight && count > 0 ? 'bg-semantic-red/20 text-semantic-red' : active ? 'bg-brand/20' : 'bg-surface-3 text-creme-faint')}>
        {count}
      </span>
    </button>
  );
}
