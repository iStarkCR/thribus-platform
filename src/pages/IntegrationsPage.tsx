import { useMemo, useState } from 'react';
import {
  Plug, Search, Plus, CheckCircle2, AlertTriangle, Star, Lock, Code,
  Shield, Clock, XCircle, Eye, ChevronRight, Activity,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_INTEGRATIONS, SEED_APPROVALS, SEED_CUSTOM_TOOLS,
  type Integration, type IntegrationCategory, type ToolApprovalRequest,
} from '@/lib/seed-integrations';
import { BrandLogo } from '@/components/shared/BrandLogo';

type Tab = 'catalog' | 'approvals' | 'custom';

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  crm: 'CRM',
  erp: 'ERP',
  comms: 'Comunicação',
  payments: 'Pagamentos',
  productivity: 'Produtividade',
  analytics: 'Analytics',
  custom: 'Custom',
};

export function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [integrations] = useState<Integration[]>(SEED_INTEGRATIONS);
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>(SEED_APPROVALS);
  const [customTools] = useState(SEED_CUSTOM_TOOLS);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all');
  const [showOnlyConnected, setShowOnlyConnected] = useState(false);

  const filtered = useMemo(() => {
    let r = integrations;
    if (category !== 'all') r = r.filter((i) => i.category === category);
    if (showOnlyConnected) r = r.filter((i) => i.status === 'connected');
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((i) => i.name.toLowerCase().includes(q) || i.vendor.toLowerCase().includes(q));
    return [...r].sort((a, b) => b.installCount - a.installCount);
  }, [integrations, category, search, showOnlyConnected]);

  const counts = useMemo(() => ({
    catalog: integrations.length,
    approvals: approvals.filter((a) => a.status === 'pending').length,
    custom: customTools.length,
  }), [integrations, approvals, customTools]);

  const reviewApproval = (id: string, decision: 'approved' | 'rejected') => {
    setApprovals((curr) =>
      curr.map((a) =>
        a.id === id
          ? { ...a, status: decision, reviewedAt: new Date().toISOString(), reviewedBy: 'Charles Andrade' }
          : a,
      ),
    );
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Plug size={16} className="text-creme-mute" /> Integrações
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · catálogo · approval queue · custom tools
          </span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all">
          <Plus size={13} /> Custom tool
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')} icon={<Plug size={13} />} label="Catálogo" count={counts.catalog} />
        <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')} icon={<Shield size={13} />} label="Aprovações" count={counts.approvals} highlight={counts.approvals > 0} />
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')} icon={<Code size={13} />} label="Custom" count={counts.custom} />
      </div>

      {tab === 'catalog' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar integração..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IntegrationCategory | 'all')}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] font-medium text-creme cursor-pointer focus:outline-none focus:border-brand"
            >
              <option value="all">Todas categorias</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[12.5px] text-creme-mute cursor-pointer">
              <input type="checkbox" checked={showOnlyConnected} onChange={(e) => setShowOnlyConnected(e.target.checked)} className="accent-brand" />
              só conectadas
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {filtered.map((i) => (
              <IntegrationCard key={i.id} integration={i} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center p-12 text-creme-faint text-[13px]">Nenhuma integração encontrada com esses filtros.</div>
          )}
        </>
      )}

      {tab === 'approvals' && (
        <div className="space-y-2.5">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onReview={reviewApproval} />
          ))}
          {approvals.length === 0 && <div className="text-center p-12 text-creme-faint">Sem aprovações na fila.</div>}
        </div>
      )}

      {tab === 'custom' && (
        <div className="space-y-2.5">
          {customTools.map((ct) => (
            <div key={ct.id} className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[13px] font-bold font-mono text-creme">{ct.name}</code>
                    <span className={clsx(
                      'text-[10.5px] font-mono px-1.5 py-px rounded-full',
                      ct.method === 'GET' ? 'bg-semantic-green/10 text-semantic-green' :
                      ct.method === 'DELETE' ? 'bg-semantic-red/10 text-semantic-red' :
                      'bg-brand/15 text-brand-bright',
                    )}>
                      {ct.method}
                    </span>
                    {ct.destructive && (
                      <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-amber/10 text-semantic-amber inline-flex items-center gap-1">
                        <AlertTriangle size={9} /> destrutiva
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-creme-mute mt-1.5 leading-relaxed">{ct.description}</p>
                  <code className="text-[11px] font-mono text-creme-faint block mt-2 truncate">{ct.endpoint}</code>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[18px] font-bold font-mono text-creme">{ct.invocations30d.toLocaleString('pt-BR')}</div>
                  <div className="text-[10.5px] uppercase tracking-wider text-creme-faint">/30d</div>
                  <div className={clsx(
                    'text-[11px] font-mono mt-1',
                    ct.errorRate > 0.05 ? 'text-semantic-red' :
                    ct.errorRate > 0.02 ? 'text-semantic-amber' : 'text-semantic-green',
                  )}>
                    {(ct.errorRate * 100).toFixed(1)}% erro
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TabButton({ active, onClick, icon, label, count, highlight }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px',
        active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent',
      )}
    >
      {icon}
      {label}
      <span className={clsx(
        'text-[11px] font-mono px-1.5 py-px rounded-full',
        active ? 'bg-brand/15 text-brand-bright' :
        highlight ? 'bg-semantic-amber/15 text-semantic-amber' :
        'bg-surface-3 text-creme-faint',
      )}>
        {count}
      </span>
    </button>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const i = integration;
  const isConnected = i.status === 'connected';
  return (
    <div className={clsx(
      'rounded-[10px] border p-4 transition-all',
      isConnected ? 'bg-surface-2 border-default hover:border-brand/40' : 'bg-surface-2/60 border-default hover:border-hover',
    )}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-1 border border-default flex items-center justify-center shrink-0">
          {i.logoSlug ? <BrandLogo slug={i.logoSlug} size={22} fallbackEmoji={i.logoEmoji} /> : <span className="text-[20px]">{i.logoEmoji}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme truncate">{i.name}</h4>
            {i.popular && <Star size={11} className="text-semantic-amber fill-semantic-amber/30 shrink-0" />}
            {i.destructive && <Lock size={10} className="text-semantic-amber shrink-0" />}
          </div>
          <div className="text-[11px] text-creme-faint truncate">{i.vendor} · {CATEGORY_LABEL[i.category]}</div>
        </div>
      </div>

      <p className="text-[12px] text-creme-mute mt-2.5 leading-relaxed line-clamp-2">{i.description}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-default">
        <div className="flex items-center gap-2 text-[11px] font-mono">
          {isConnected ? (
            <span className="inline-flex items-center gap-1 text-semantic-green">
              <CheckCircle2 size={11} /> {i.connectedWorkspaces} ws
            </span>
          ) : i.status === 'degraded' ? (
            <span className="inline-flex items-center gap-1 text-semantic-amber"><AlertTriangle size={11} /> degraded</span>
          ) : i.status === 'deprecated' ? (
            <span className="inline-flex items-center gap-1 text-semantic-red"><XCircle size={11} /> deprecated</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-creme-faint"><Plug size={11} /> disponível</span>
          )}
          <span className="text-creme-faint">·</span>
          <span className="text-creme-faint">{i.toolCount} tools</span>
        </div>
        <button className={clsx(
          'text-[11.5px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 transition-all',
          isConnected
            ? 'bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme'
            : 'bg-brand-dim border border-brand text-creme hover:bg-brand',
        )}>
          {isConnected ? 'Gerenciar' : 'Conectar'}
          <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

function ApprovalCard({ approval, onReview }: { approval: ToolApprovalRequest; onReview: (id: string, d: 'approved' | 'rejected') => void }) {
  const a = approval;
  const isPending = a.status === 'pending';

  const statusMeta = {
    pending: { label: 'aguardando', color: 'text-semantic-amber bg-semantic-amber/10', Icon: Clock },
    approved: { label: 'aprovada', color: 'text-semantic-green bg-semantic-green/10', Icon: CheckCircle2 },
    rejected: { label: 'rejeitada', color: 'text-semantic-red bg-semantic-red/10', Icon: XCircle },
    executed: { label: 'executada', color: 'text-brand-bright bg-brand/15', Icon: Activity },
    failed: { label: 'falhou', color: 'text-semantic-red bg-semantic-red/10', Icon: AlertTriangle },
  }[a.status];
  const StatusIcon = statusMeta.Icon;

  return (
    <div className={clsx(
      'rounded-[10px] border p-4 transition-all',
      isPending ? 'bg-surface-2 border-semantic-amber/30' : 'bg-surface-2 border-default',
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[13px] font-bold font-mono text-creme">{a.toolName}</code>
            <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-mono', statusMeta.color)}>
              <StatusIcon size={10} /> {statusMeta.label}
            </span>
            <span className="text-[11px] text-creme-faint">por {a.agentName}</span>
          </div>
          <p className="text-[12.5px] text-creme-mute mt-2 leading-relaxed">
            <span className="text-creme-faint font-semibold text-[11px] uppercase tracking-wider mr-2">Justificativa:</span>
            {a.reason}
          </p>
        </div>
        <div className="text-[10.5px] text-creme-faint font-mono shrink-0 text-right">
          {new Date(a.requestedAt).toLocaleString('pt-BR')}
        </div>
      </div>

      <details className="text-[11.5px]">
        <summary className="cursor-pointer text-creme-faint hover:text-creme-mute inline-flex items-center gap-1 select-none">
          <Eye size={10} /> ver payload
        </summary>
        <pre className="mt-2 p-2.5 bg-surface-1 rounded-md text-[11px] font-mono text-creme-dim overflow-x-auto border border-default">
{JSON.stringify(a.payload, null, 2)}
        </pre>
      </details>

      {a.notes && (
        <div className="mt-3 p-2.5 bg-surface-1 rounded-md text-[11.5px] text-creme-mute leading-relaxed border-l-2 border-creme-faint/30">
          <span className="text-creme-faint font-semibold text-[10.5px] uppercase tracking-wider">Nota{a.reviewedBy ? ` (${a.reviewedBy})` : ''}:</span> {a.notes}
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-default">
          <button
            onClick={() => onReview(a.id, 'approved')}
            className="flex-1 py-1.5 rounded-md bg-semantic-green/15 hover:bg-semantic-green/25 text-semantic-green text-[12.5px] font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={12} /> Aprovar
          </button>
          <button
            onClick={() => onReview(a.id, 'rejected')}
            className="flex-1 py-1.5 rounded-md bg-semantic-red/15 hover:bg-semantic-red/25 text-semantic-red text-[12.5px] font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <XCircle size={12} /> Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}
