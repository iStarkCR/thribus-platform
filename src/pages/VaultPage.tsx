import { useState } from 'react';
import {
  KeyRound, Lock, Plus, Eye, EyeOff, Copy, RefreshCw, Trash2,
  Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_SECRETS, SEED_API_KEYS, type SecretEntry, type ApiKey } from '@/lib/seed-final';

type Tab = 'secrets' | 'apikeys';

const CATEGORY_COLOR: Record<SecretEntry['category'], string> = {
  crm: 'bg-brand/15 text-brand-bright',
  erp: 'bg-semantic-amber/15 text-semantic-amber',
  payment: 'bg-semantic-green/15 text-semantic-green',
  comms: 'bg-brand/15 text-brand-bright',
  analytics: 'bg-creme-faint/15 text-creme-mute',
  custom: 'bg-surface-3 text-creme-dim',
};

export function VaultPage() {
  const [tab, setTab] = useState<Tab>('secrets');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Lock size={16} className="text-creme-mute" /> Vault & API Keys
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · secrets do workspace · chaves de API outbound · rotação
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
          <Plus size={11} /> Novo
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'secrets'} onClick={() => setTab('secrets')} label="Secrets (inbound)" count={SEED_SECRETS.length} icon={<Lock size={13} />} />
        <TabBtn active={tab === 'apikeys'} onClick={() => setTab('apikeys')} label="API Keys (outbound)" count={SEED_API_KEYS.length} icon={<KeyRound size={13} />} />
      </div>

      {tab === 'secrets' && (
        <>
          <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
            <Lock size={12} className="inline mr-1.5 text-brand-bright" />
            Credenciais que o Thribus usa pra falar com sistemas do cliente (IXC, Stripe, Asaas, Talki). Mascaradas no display, encriptadas em rest.
          </div>
          <div className="space-y-2">
            {SEED_SECRETS.map((s) => <SecretRow key={s.id} secret={s} />)}
          </div>
        </>
      )}

      {tab === 'apikeys' && (
        <>
          <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
            <KeyRound size={12} className="inline mr-1.5 text-brand-bright" />
            Chaves que sistemas externos (worker, BI) usam pra falar com Thribus API. Cada chave tem scopes restritos.
          </div>
          <div className="space-y-2">
            {SEED_API_KEYS.map((k) => <ApiKeyRow key={k.id} apiKey={k} />)}
          </div>
        </>
      )}
    </>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', active ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
      {icon} {label}
      <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{count}</span>
    </button>
  );
}

function SecretRow({ secret: s }: { secret: SecretEntry }) {
  const [revealed, setRevealed] = useState(false);
  const overdue = s.rotatesEveryDays && s.lastUsedAt &&
    (Date.now() - new Date(s.createdAt).getTime()) / 86_400_000 > s.rotatesEveryDays;

  return (
    <div className={clsx('bg-surface-2 border rounded-[10px] p-3.5 flex items-center gap-3', overdue ? 'border-semantic-amber/30' : 'border-default')}>
      <Lock size={14} className="text-creme-mute shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[13px] font-mono font-bold text-creme">{s.key}</code>
          <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', CATEGORY_COLOR[s.category])}>{s.category}</span>
          {overdue && (
            <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-amber/15 text-semantic-amber inline-flex items-center gap-1">
              <AlertTriangle size={9} /> rotação atrasada
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="text-[11.5px] font-mono text-creme-dim">{revealed ? '••• (mock — só admin via SSH revela) •••' : s.maskedValue}</code>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10.5px] font-mono text-creme-faint">
          {s.lastUsedAt && <span><Clock size={9} className="inline mr-0.5" /> usado {new Date(s.lastUsedAt).toLocaleString('pt-BR')}</span>}
          {s.rotatesEveryDays && <span>· rotação {s.rotatesEveryDays}d</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setRevealed(!revealed)} className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover" title={revealed ? 'Ocultar' : 'Revelar'}>
          {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover" title="Copiar"><Copy size={12} /></button>
        <button className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover" title="Rotacionar"><RefreshCw size={12} /></button>
        <button className="p-1.5 rounded-md text-semantic-red/70 hover:bg-semantic-red/10 hover:text-semantic-red" title="Remover"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function ApiKeyRow({ apiKey: k }: { apiKey: ApiKey }) {
  const expired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3.5">
      <div className="flex items-start gap-3">
        <KeyRound size={14} className="text-brand-bright shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-creme">{k.label}</span>
            {expired ? (
              <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-red/15 text-semantic-red">expirada</span>
            ) : (
              <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1">
                <CheckCircle2 size={9} /> ativa
              </span>
            )}
          </div>
          <code className="text-[12px] font-mono text-creme-dim mt-1 block">{k.prefix}••••••••••••</code>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {k.scopes.map((s) => (
              <code key={s} className="text-[10.5px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-dim">{s}</code>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10.5px] font-mono text-creme-faint">
            {k.lastUsedAt && <span><Clock size={9} className="inline mr-0.5" />usado {new Date(k.lastUsedAt).toLocaleString('pt-BR')}</span>}
            {k.expiresAt && <span>· expira {new Date(k.expiresAt).toLocaleDateString('pt-BR')}</span>}
            <span>· criada {new Date(k.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover"><Copy size={12} /></button>
          <button className="p-1.5 rounded-md text-creme-mute hover:bg-surface-hover"><RefreshCw size={12} /></button>
          <button className="p-1.5 rounded-md text-semantic-red/70 hover:bg-semantic-red/10 hover:text-semantic-red"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}
