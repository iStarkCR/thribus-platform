import { useEffect, useState } from 'react';
import {
  Smartphone, Bell, CheckCircle2, AlertTriangle, MessageSquare,
  FileBarChart, Download, QrCode, Apple, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_MOBILE_NOTIFS, type MobileNotification } from '@/lib/seed-extras2';
import * as platform from '@/services/platform';

const TYPE_ICON = {
  approval: CheckCircle2,
  alert: AlertTriangle,
  sla_breach: AlertTriangle,
  mention: MessageSquare,
  report: FileBarChart,
};
const TYPE_COLOR = {
  approval: 'text-brand-bright',
  alert: 'text-semantic-amber',
  sla_breach: 'text-semantic-red',
  mention: 'text-semantic-green',
  report: 'text-creme-mute',
};

export function MobilePage() {
  const unread = SEED_MOBILE_NOTIFS.filter((n) => !n.read).length;
  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!platform.platformConfigured) return;
    platform.getNotifPreferences('ws_texnet').then((p) => {
      if (p) { setSource('live'); setPrefsLoaded(true); }
    }).catch((e) => console.warn('[Mobile] live falhou:', (e as Error).message));
  }, []);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Smartphone size={16} className="text-creme-mute" /> Mobile / PWA
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · supervisor approval · push notifications · PWA atendente
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · prefs ${prefsLoaded ? 'OK' : '—'}` : 'mock'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[300px_1fr_360px] gap-3 h-[calc(100vh-160px)] min-h-[520px]">
        <div className="bg-surface-2 border border-default rounded-[10px] p-4 flex flex-col items-center justify-center">
          <div className="w-[220px] h-[440px] bg-surface-1 rounded-[36px] border-[6px] border-creme/20 p-3 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80px] h-[18px] bg-creme/20 rounded-b-2xl" />
            <div className="pt-5 h-full overflow-y-auto space-y-2">
              <div className="text-[10px] font-mono text-creme-faint text-center mb-2">9:42 AM</div>
              <div className="bg-surface-2 rounded-xl p-2.5 border border-default">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded bg-brand flex items-center justify-center"><Bell size={9} className="text-creme" /></div>
                  <span className="text-[9px] font-mono text-creme-faint">Thribus · agora</span>
                </div>
                <div className="text-[11px] font-bold text-creme">Aprovação pendente</div>
                <div className="text-[10px] text-creme-mute leading-tight mt-0.5">Bianca solicitou refund R$ 199.</div>
                <div className="flex items-center gap-1 mt-2">
                  <button className="flex-1 py-1 rounded text-[9px] font-bold bg-semantic-green/20 text-semantic-green">Aprovar</button>
                  <button className="flex-1 py-1 rounded text-[9px] font-bold bg-semantic-red/20 text-semantic-red">Rejeitar</button>
                </div>
              </div>
              <div className="bg-surface-2 rounded-xl p-2.5 border border-default">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={9} className="text-semantic-red" />
                  <span className="text-[9px] font-mono text-creme-faint">SLA breach</span>
                </div>
                <div className="text-[10px] text-creme-mute leading-tight">Aline Souza · escalação 2h15min sem resposta.</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-2.5 border border-default">
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare size={9} className="text-semantic-green" />
                  <span className="text-[9px] font-mono text-creme-faint">@menção</span>
                </div>
                <div className="text-[10px] text-creme-mute leading-tight">Marcia: "@charles essa Aline já é a 3ª..."</div>
              </div>
            </div>
          </div>
          <div className="text-center mt-4">
            <h4 className="text-[13px] font-bold text-creme">App Supervisor</h4>
            <p className="text-[11.5px] text-creme-faint mt-0.5">Aprovação ao vivo · push em tempo real</p>
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-creme">Notificações</h3>
            <span className="text-[11px] font-mono px-1.5 py-px rounded-full bg-semantic-red/15 text-semantic-red">{unread} não lidas</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-default">
            {SEED_MOBILE_NOTIFS.map((n) => <NotifRow key={n.id} notif={n} />)}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] p-4 space-y-4 overflow-y-auto">
          <div>
            <h4 className="text-[13px] font-bold text-creme mb-2">Baixar apps</h4>
            <div className="space-y-2">
              <DownloadCard icon={<Apple size={18} />} label="iOS — App Store" subtitle="Supervisor + Atendente" />
              <DownloadCard icon={<Smartphone size={18} />} label="Android — Play Store" subtitle="Supervisor + Atendente" />
              <DownloadCard icon={<QrCode size={18} />} label="PWA Web" subtitle="Funciona em qualquer browser, instala como app" badge="recomendado" />
            </div>
          </div>

          <div>
            <h4 className="text-[13px] font-bold text-creme mb-2">Configuração de push</h4>
            <div className="space-y-1.5">
              <ToggleRow label="Aprovação destrutiva" active />
              <ToggleRow label="SLA estourou" active />
              <ToggleRow label="@menção" active />
              <ToggleRow label="Reports prontos" active />
              <ToggleRow label="PII detectada (high)" />
              <ToggleRow label="Tool falhando 3x+" />
            </div>
          </div>

          <div className="bg-brand/5 border border-brand/20 rounded-md p-3">
            <h5 className="text-[11.5px] font-bold text-brand-bright mb-1">📱 PWA Atendente</h5>
            <p className="text-[11.5px] text-creme-mute leading-relaxed">
              Atendente humano abre PWA no celular fora da mesa, vê inbox + Co-pilot, responde lead, e voltou pra mesa: tudo sincronizado.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function NotifRow({ notif: n }: { notif: MobileNotification }) {
  const Icon = TYPE_ICON[n.type];
  return (
    <div className={clsx('p-3 flex items-start gap-3', !n.read && 'bg-brand/5')}>
      <Icon size={14} className={clsx('shrink-0 mt-0.5', TYPE_COLOR[n.type])} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-creme">{n.title}</span>
          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-semantic-red" />}
        </div>
        <p className="text-[11.5px] text-creme-mute mt-0.5 leading-snug">{n.body}</p>
        <div className="text-[10.5px] text-creme-faint font-mono mt-1 flex items-center gap-2">
          {new Date(n.timestamp).toLocaleString('pt-BR')}
          {n.pushSent && <span className="text-brand-bright inline-flex items-center gap-0.5"><Bell size={8} /> push enviado</span>}
        </div>
      </div>
    </div>
  );
}

function DownloadCard({ icon, label, subtitle, badge }: { icon: React.ReactNode; label: string; subtitle: string; badge?: string }) {
  return (
    <button className="w-full flex items-center gap-3 p-2.5 rounded-md bg-surface-1 border border-default hover:border-brand/40 transition-all">
      <span className="text-creme-mute shrink-0">{icon}</span>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-creme">{label}</span>
          {badge && <span className="text-[9.5px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright uppercase">{badge}</span>}
        </div>
        <div className="text-[11px] text-creme-faint">{subtitle}</div>
      </div>
      <Download size={13} className="text-creme-faint shrink-0" />
    </button>
  );
}

function ToggleRow({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-surface-1 border border-default">
      <span className="text-[12px] text-creme-mute">{label}</span>
      <div className={clsx('w-8 h-4 rounded-full transition-colors relative', active ? 'bg-brand' : 'bg-surface-3')}>
        <span className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-creme transition-all', active ? 'left-[18px]' : 'left-0.5')} />
      </div>
    </div>
  );
}
