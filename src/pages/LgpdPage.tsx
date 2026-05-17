import { useState } from 'react';
import {
  ShieldCheck, FileLock, Download, Trash2, RefreshCw,
  Eye, EyeOff, AlertTriangle, CheckCircle2, Clock, XCircle,
  CreditCard, IdCard, Phone, Mail,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_DSR, SEED_PII, SEED_CONSENT,
  type DsrRequest, type DsrType, type DsrStatus,
} from '@/lib/seed-extras2';

type Tab = 'dsr' | 'pii' | 'consent';

const DSR_LABEL: Record<DsrType, { label: string; Icon: typeof Eye }> = {
  access: { label: 'Acesso aos dados', Icon: Eye },
  portability: { label: 'Portabilidade', Icon: Download },
  deletion: { label: 'Exclusão', Icon: Trash2 },
  rectification: { label: 'Retificação', Icon: RefreshCw },
  consent_revoke: { label: 'Revogação de consentimento', Icon: EyeOff },
};

const STATUS_META: Record<DsrStatus, { label: string; color: string; Icon: typeof Clock }> = {
  pending: { label: 'pendente', color: 'bg-semantic-amber/15 text-semantic-amber', Icon: Clock },
  in_progress: { label: 'em andamento', color: 'bg-brand/15 text-brand-bright', Icon: RefreshCw },
  completed: { label: 'completada', color: 'bg-semantic-green/15 text-semantic-green', Icon: CheckCircle2 },
  rejected: { label: 'rejeitada', color: 'bg-semantic-red/15 text-semantic-red', Icon: XCircle },
};

const PII_ICON = { cpf: IdCard, cnpj: IdCard, cartao: CreditCard, cep: IdCard, rg: IdCard, email: Mail, telefone: Phone };

export function LgpdPage() {
  const [tab, setTab] = useState<Tab>('dsr');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <ShieldCheck size={16} className="text-creme-mute" /> LGPD Center
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · DSR · PII scanner · consent log
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'dsr'} onClick={() => setTab('dsr')} icon={<FileLock size={13} />} label="DSR Requests" count={SEED_DSR.length} />
        <TabBtn active={tab === 'pii'} onClick={() => setTab('pii')} icon={<AlertTriangle size={13} />} label="PII Scanner" count={SEED_PII.length} />
        <TabBtn active={tab === 'consent'} onClick={() => setTab('consent')} icon={<CheckCircle2 size={13} />} label="Consent Log" count={SEED_CONSENT.length} />
      </div>

      {tab === 'dsr' && <DsrPanel />}
      {tab === 'pii' && <PiiPanel />}
      {tab === 'consent' && <ConsentPanel />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px', active ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
      {icon} {label}
      <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{count}</span>
    </button>
  );
}

function DsrPanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <FileLock size={12} className="inline mr-1.5 text-brand-bright" />
        Solicitações de titular (LGPD Art. 18) — você tem <b>15 dias</b> pra atender. Cliente recebe email automático em cada update.
      </div>
      <div className="space-y-2">
        {SEED_DSR.map((d) => <DsrRow key={d.id} dsr={d} />)}
      </div>
    </>
  );
}

function DsrRow({ dsr: d }: { dsr: DsrRequest }) {
  const meta = STATUS_META[d.status];
  const StatusIcon = meta.Icon;
  const TypeIcon = DSR_LABEL[d.type].Icon;
  const slaLeft = Math.max(0, Math.floor((new Date(d.slaDeadline).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-surface-1 border border-default flex items-center justify-center">
        <TypeIcon size={16} className="text-brand-bright" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-bold text-creme">{DSR_LABEL[d.type].label}</span>
          <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1', meta.color)}>
            <StatusIcon size={9} className={d.status === 'in_progress' ? 'animate-spin' : ''} /> {meta.label}
          </span>
        </div>
        <div className="text-[11.5px] text-creme-mute mt-0.5">
          {d.customerName} · <code className="font-mono text-creme-faint">{d.customerEmail}</code>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={clsx('text-[14px] font-bold font-mono', slaLeft <= 3 ? 'text-semantic-red' : slaLeft <= 7 ? 'text-semantic-amber' : 'text-creme')}>
          {d.status === 'completed' ? '—' : `${slaLeft}d`}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-creme-faint">SLA restante</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {d.status === 'pending' && <button className="px-2 py-1 rounded-md text-[11.5px] font-semibold bg-brand-dim border border-brand text-creme">Iniciar</button>}
        {d.status === 'in_progress' && <button className="px-2 py-1 rounded-md text-[11.5px] font-semibold bg-semantic-green/15 text-semantic-green">Concluir</button>}
        {d.status === 'completed' && <button className="px-2 py-1 rounded-md text-[11.5px] font-semibold bg-surface-3 text-creme-mute inline-flex items-center gap-1"><Download size={11} /> Baixar export</button>}
      </div>
    </div>
  );
}

function PiiPanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <AlertTriangle size={12} className="inline mr-1.5 text-semantic-amber" />
        Toda mensagem é escaneada antes de logar. PII detectada é mascarada, sinalizada ou bloqueada conforme política.
      </div>
      <div className="space-y-2">
        {SEED_PII.map((p) => {
          const Icon = PII_ICON[p.category];
          return (
            <div key={p.id} className="bg-surface-2 border border-default rounded-[10px] p-3 flex items-center gap-3">
              <Icon size={14} className="text-semantic-amber shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[11px] font-mono px-1.5 py-px rounded bg-semantic-amber/10 text-semantic-amber uppercase">{p.category}</code>
                  <span className="text-[12px] text-creme-mute">→</span>
                  <code className="text-[12.5px] font-mono text-creme">{p.masked}</code>
                </div>
                <div className="text-[10.5px] text-creme-faint font-mono mt-0.5">
                  conv {p.conversationId} · msg {p.messageId} · {new Date(p.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>
              <span className={clsx(
                'text-[10.5px] font-mono px-2 py-0.5 rounded-full shrink-0',
                p.action === 'masked' ? 'bg-brand/15 text-brand-bright' :
                p.action === 'blocked' ? 'bg-semantic-red/15 text-semantic-red' :
                'bg-semantic-amber/15 text-semantic-amber',
              )}>
                {p.action}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ConsentPanel() {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
      <div className="grid grid-cols-[1fr_140px_120px_140px_140px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
        <div>Cliente</div>
        <div>Finalidade</div>
        <div>Status</div>
        <div>Canal</div>
        <div>Quando</div>
      </div>
      {SEED_CONSENT.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_140px_120px_140px_140px] gap-3 px-4 py-2.5 text-[12px] border-t border-default hover:bg-surface-hover/30">
          <div>
            <div className="text-creme font-semibold truncate">{c.customerName}</div>
            <code className="text-[10.5px] font-mono text-creme-faint">{c.customerEmail}</code>
          </div>
          <code className="text-[11.5px] font-mono text-creme-dim">{c.purpose}</code>
          <span className={clsx('text-[10.5px] font-mono px-1.5 py-0.5 rounded-full w-fit h-fit', c.granted ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-red/15 text-semantic-red')}>
            {c.granted ? 'concedido' : 'revogado'}
          </span>
          <span className="text-[11.5px] text-creme-mute">{c.channel}</span>
          <span className="text-[10.5px] font-mono text-creme-faint">{new Date(c.timestamp).toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  );
}
