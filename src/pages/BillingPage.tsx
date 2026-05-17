import { useMemo, useState } from 'react';
import {
  CreditCard, Search, QrCode, Receipt, DollarSign, AlertTriangle,
  CheckCircle2, Clock, XCircle, Copy, Download, Send,
  TrendingUp, TrendingDown, FileText, RotateCcw, Plus,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_STRIPE_CUSTOMERS, SEED_STRIPE_SUBSCRIPTIONS, SEED_STRIPE_INVOICES, SEED_STRIPE_REFUNDS,
  SEED_ASAAS_CUSTOMERS, SEED_ASAAS_CHARGES, SEED_ASAAS_SUBSCRIPTIONS, BILLING_SUMMARY,
} from '@/lib/seed-billing';
import type { StripeSubscription, StripeInvoice } from '@/services/stripe';
import type { AsaasCharge, AsaasChargeStatus, AsaasBillingType } from '@/services/asaas';

type Gateway = 'all' | 'stripe' | 'asaas';
type Tab = 'overview' | 'customers' | 'subscriptions' | 'charges' | 'refunds';

export function BillingPage() {
  const [gateway, setGateway] = useState<Gateway>('all');
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <CreditCard size={16} className="text-creme-mute" /> Billing
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · Stripe (USD/internacional) + Asaas (PIX/boleto BR)
          </span>
        </div>
        <div className="flex items-center bg-surface-2 border border-default rounded-md p-0.5">
          {(['all', 'stripe', 'asaas'] as Gateway[]).map((g) => (
            <button key={g} onClick={() => setGateway(g)} className={clsx(
              'px-2.5 py-1 rounded-[5px] text-[11.5px] font-semibold transition-all uppercase',
              gateway === g ? (
                g === 'stripe' ? 'bg-brand/15 text-brand-bright' :
                g === 'asaas' ? 'bg-semantic-green/15 text-semantic-green' :
                'bg-creme/10 text-creme'
              ) : 'text-creme-mute',
            )}>
              {g === 'all' ? 'Ambos' : g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default overflow-x-auto">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} label="Overview" />
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')} label="Customers" />
        <TabBtn active={tab === 'subscriptions'} onClick={() => setTab('subscriptions')} label="Assinaturas" />
        <TabBtn active={tab === 'charges'} onClick={() => setTab('charges')} label={gateway === 'stripe' ? 'Invoices' : 'Cobranças'} />
        <TabBtn active={tab === 'refunds'} onClick={() => setTab('refunds')} label="Refunds" />
      </div>

      {tab === 'overview' && <OverviewPanel gateway={gateway} />}
      {tab === 'customers' && <CustomersPanel gateway={gateway} />}
      {tab === 'subscriptions' && <SubscriptionsPanel gateway={gateway} />}
      {tab === 'charges' && <ChargesPanel gateway={gateway} />}
      {tab === 'refunds' && <RefundsPanel gateway={gateway} />}
    </>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={clsx('px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px shrink-0', active ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
      {label}
    </button>
  );
}

function OverviewPanel({ gateway }: { gateway: Gateway }) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {(gateway === 'all' || gateway === 'stripe') && (
          <>
            <StatCard color="brand" icon={<DollarSign size={12} />} label="MRR Stripe" value={`US$ ${(BILLING_SUMMARY.totalMRRStripeUSD).toLocaleString('pt-BR')}`} trend="+12%" />
            <StatCard color="brand" icon={<TrendingDown size={12} />} label="Refunds 30d" value={`US$ ${BILLING_SUMMARY.refundedLast30dUSD.toFixed(2)}`} />
          </>
        )}
        {(gateway === 'all' || gateway === 'asaas') && (
          <>
            <StatCard color="green" icon={<QrCode size={12} />} label="PIX pendente BR" value={`R$ ${BILLING_SUMMARY.pendingPixBRL.toFixed(2)}`} />
            <StatCard color="amber" icon={<AlertTriangle size={12} />} label="Em atraso BR" value={`R$ ${BILLING_SUMMARY.overdueBRL.toFixed(2)}`} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(gateway === 'all' || gateway === 'stripe') && (
          <div className="bg-surface-2 border border-default rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center">
                <CreditCard size={13} className="text-brand-bright" />
              </div>
              <h3 className="text-[13.5px] font-bold text-creme">Stripe — SaaS B2B</h3>
              <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green">
                <CheckCircle2 size={9} /> conectado
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="Customers" value={SEED_STRIPE_CUSTOMERS.length.toString()} />
              <MiniStat label="Subs ativas" value={SEED_STRIPE_SUBSCRIPTIONS.filter((s) => s.status === 'active').length.toString()} />
              <MiniStat label="Past due" value={SEED_STRIPE_SUBSCRIPTIONS.filter((s) => s.status === 'past_due').length.toString()} highlight="amber" />
            </div>
            <div className="space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">Última fatura</div>
              {SEED_STRIPE_INVOICES.slice(0, 2).map((i) => <InvoiceMini key={i.id} invoice={i} />)}
            </div>
          </div>
        )}

        {(gateway === 'all' || gateway === 'asaas') && (
          <div className="bg-surface-2 border border-default rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-semantic-green/15 flex items-center justify-center">
                <QrCode size={13} className="text-semantic-green" />
              </div>
              <h3 className="text-[13.5px] font-bold text-creme">Asaas — Clientes BR</h3>
              <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green">
                <CheckCircle2 size={9} /> conectado
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="Customers" value={SEED_ASAAS_CUSTOMERS.length.toString()} />
              <MiniStat label="Subs ativas" value={SEED_ASAAS_SUBSCRIPTIONS.filter((s) => s.status === 'ACTIVE').length.toString()} />
              <MiniStat label="Vencidas" value={SEED_ASAAS_CHARGES.filter((c) => c.status === 'OVERDUE').length.toString()} highlight="red" />
            </div>
            <div className="space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">Últimas cobranças</div>
              {SEED_ASAAS_CHARGES.slice(0, 2).map((c) => <ChargeMini key={c.id} charge={c} />)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode; label: string; value: string; trend?: string; color: 'brand' | 'green' | 'amber' | 'red' }) {
  const colors = {
    brand: 'border-brand/30 bg-brand/5', green: 'border-semantic-green/30 bg-semantic-green/5',
    amber: 'border-semantic-amber/30 bg-semantic-amber/5', red: 'border-semantic-red/30 bg-semantic-red/5',
  }[color];
  return (
    <div className={clsx('rounded-[10px] border p-3', colors)}>
      <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">{icon} {label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-[18px] font-bold font-mono text-creme">{value}</div>
        {trend && <span className="text-[10.5px] font-mono text-semantic-green inline-flex items-center gap-0.5"><TrendingUp size={9} />{trend}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: 'amber' | 'red' }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[14px] font-bold font-mono mt-0.5', highlight === 'amber' ? 'text-semantic-amber' : highlight === 'red' ? 'text-semantic-red' : 'text-creme')}>{value}</div>
    </div>
  );
}

function InvoiceMini({ invoice: i }: { invoice: StripeInvoice }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-surface-1 border border-default">
      <Receipt size={12} className="text-creme-mute shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold text-creme truncate">{i.customerName}</div>
        <code className="text-[10px] font-mono text-creme-faint">{i.number}</code>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] font-bold font-mono text-creme">US$ {(i.amount / 100).toFixed(2)}</div>
        <InvoiceStatusBadge status={i.status} />
      </div>
    </div>
  );
}

function ChargeMini({ charge: c }: { charge: AsaasCharge }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-surface-1 border border-default">
      {c.billingType === 'PIX' ? <QrCode size={12} className="text-semantic-green shrink-0" /> : <Receipt size={12} className="text-semantic-amber shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold text-creme truncate">{c.customerName}</div>
        <div className="text-[10px] font-mono text-creme-faint truncate">{c.description}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] font-bold font-mono text-creme">R$ {c.value.toFixed(2)}</div>
        <ChargeStatusBadge status={c.status} />
      </div>
    </div>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────
function CustomersPanel({ gateway }: { gateway: Gateway }) {
  const [search, setSearch] = useState('');
  const filteredStripe = SEED_STRIPE_CUSTOMERS.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));
  const filteredAsaas = SEED_ASAAS_CUSTOMERS.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.cpfCnpj.includes(search));

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[360px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, email, CPF/CNPJ..." className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand" />
        </div>
      </div>

      {(gateway === 'all' || gateway === 'stripe') && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-brand-bright mb-2 inline-flex items-center gap-1.5"><CreditCard size={11} /> Stripe</h3>
          <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-[1fr_180px_120px_120px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
              <div>Cliente</div><div>Email</div><div>Assinaturas</div><div className="text-right">LTV</div>
            </div>
            {filteredStripe.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_180px_120px_120px] gap-3 px-4 py-2.5 border-t border-default text-[12px] hover:bg-surface-hover/30">
                <div>
                  <div className="font-semibold text-creme">{c.name}</div>
                  <code className="text-[10px] font-mono text-creme-faint">{c.id}</code>
                </div>
                <code className="font-mono text-creme-mute text-[11.5px] truncate">{c.email}</code>
                <div className="font-mono text-creme-dim">{c.subscriptionsCount}</div>
                <div className="font-mono text-creme text-right font-bold">US$ {c.totalSpent.toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(gateway === 'all' || gateway === 'asaas') && (
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-semantic-green mb-2 inline-flex items-center gap-1.5"><QrCode size={11} /> Asaas</h3>
          <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-[1fr_160px_120px_120px_120px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
              <div>Cliente</div><div>CPF/CNPJ</div><div>Cidade</div><div>Pendente</div><div className="text-right">Total pago</div>
            </div>
            {filteredAsaas.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_160px_120px_120px_120px] gap-3 px-4 py-2.5 border-t border-default text-[12px] hover:bg-surface-hover/30">
                <div>
                  <div className="font-semibold text-creme">{c.name}</div>
                  <code className="text-[10px] font-mono text-creme-faint">{c.id}</code>
                </div>
                <code className="font-mono text-creme-mute text-[11.5px]">{c.cpfCnpj}</code>
                <div className="text-creme-mute">{c.city}</div>
                <div className={clsx('font-mono', c.pendingAmount > 0 ? 'text-semantic-amber' : 'text-creme-faint')}>
                  R$ {c.pendingAmount.toFixed(2)}
                </div>
                <div className="font-mono text-creme text-right font-bold">R$ {c.totalPaid.toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Subscriptions ────────────────────────────────────────────────────────
function SubscriptionsPanel({ gateway }: { gateway: Gateway }) {
  return (
    <>
      {(gateway === 'all' || gateway === 'stripe') && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-brand-bright mb-2 inline-flex items-center gap-1.5"><CreditCard size={11} /> Stripe</h3>
          <div className="space-y-2">
            {SEED_STRIPE_SUBSCRIPTIONS.map((s) => <StripeSubRow key={s.id} sub={s} />)}
          </div>
        </div>
      )}
      {(gateway === 'all' || gateway === 'asaas') && (
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-semantic-green mb-2 inline-flex items-center gap-1.5"><QrCode size={11} /> Asaas</h3>
          <div className="space-y-2">
            {SEED_ASAAS_SUBSCRIPTIONS.map((s) => (
              <div key={s.id} className="bg-surface-2 border border-default rounded-[10px] p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-creme">{s.customerName}</div>
                  <div className="text-[11.5px] text-creme-mute mt-0.5">{s.description}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <BillingTypeBadge type={s.billingType} />
                    <span className="text-[10.5px] font-mono text-creme-faint">próx: {new Date(s.nextDueDate).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <span className={clsx('text-[10.5px] font-mono px-1.5 py-0.5 rounded-full uppercase', s.status === 'ACTIVE' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-surface-3 text-creme-mute')}>
                  {s.status}
                </span>
                <div className="text-right">
                  <div className="text-[14px] font-bold font-mono text-creme">R$ {s.value.toFixed(2)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-creme-faint">{s.cycle.toLowerCase()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StripeSubRow({ sub: s }: { sub: StripeSubscription }) {
  const meta = {
    active: { color: 'bg-semantic-green/15 text-semantic-green', label: 'ativa' },
    past_due: { color: 'bg-semantic-amber/15 text-semantic-amber', label: 'atrasada' },
    canceled: { color: 'bg-semantic-red/15 text-semantic-red', label: 'cancelada' },
    trialing: { color: 'bg-brand/15 text-brand-bright', label: 'trial' },
    incomplete: { color: 'bg-semantic-amber/15 text-semantic-amber', label: 'incompleta' },
  }[s.status];
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-creme">{s.customerName}</div>
        <div className="text-[11.5px] text-creme-mute mt-0.5">{s.product}</div>
      </div>
      <span className={clsx('text-[10.5px] font-mono px-1.5 py-0.5 rounded-full', meta.color)}>{meta.label}</span>
      <div className="text-right">
        <div className="text-[14px] font-bold font-mono text-creme">US$ {(s.amount / 100).toFixed(2)}</div>
        <div className="text-[10px] uppercase tracking-wider text-creme-faint">/{s.interval === 'month' ? 'mês' : 'ano'}</div>
      </div>
      <button className="px-2 py-1 rounded-md text-[11px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme">
        Cancelar
      </button>
    </div>
  );
}

// ─── Charges (Asaas + Stripe Invoices) ───────────────────────────────────
function ChargesPanel({ gateway }: { gateway: Gateway }) {
  const [statusFilter, setStatusFilter] = useState<AsaasChargeStatus | 'all'>('all');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {gateway !== 'stripe' && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AsaasChargeStatus | 'all')} className="px-3 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] text-creme">
              <option value="all">Todos status</option>
              <option value="PENDING">Pendentes</option>
              <option value="CONFIRMED">Confirmadas</option>
              <option value="RECEIVED">Recebidas</option>
              <option value="OVERDUE">Em atraso</option>
              <option value="REFUNDED">Reembolsadas</option>
            </select>
          )}
        </div>
        <button className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
          <Plus size={11} /> Nova cobrança
        </button>
      </div>

      {(gateway === 'all' || gateway === 'asaas') && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-semantic-green mb-2 inline-flex items-center gap-1.5"><QrCode size={11} /> Asaas (BR)</h3>
          <div className="space-y-2">
            {SEED_ASAAS_CHARGES.filter((c) => statusFilter === 'all' || c.status === statusFilter).map((c) => <AsaasChargeCard key={c.id} charge={c} />)}
          </div>
        </div>
      )}

      {(gateway === 'all' || gateway === 'stripe') && (
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-brand-bright mb-2 inline-flex items-center gap-1.5"><CreditCard size={11} /> Stripe — Invoices</h3>
          <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-[160px_1fr_120px_120px_140px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
              <div>Número</div><div>Cliente</div><div>Status</div><div>Valor</div><div>Quando</div>
            </div>
            {SEED_STRIPE_INVOICES.map((i) => (
              <div key={i.id} className="grid grid-cols-[160px_1fr_120px_120px_140px] gap-3 px-4 py-2.5 border-t border-default text-[12px] hover:bg-surface-hover/30">
                <code className="font-mono text-creme-mute">{i.number}</code>
                <div className="font-semibold text-creme truncate">{i.customerName}</div>
                <InvoiceStatusBadge status={i.status} />
                <div className="font-mono text-creme font-bold">US$ {(i.amount / 100).toFixed(2)}</div>
                <div className="text-[10.5px] font-mono text-creme-faint">{new Date(i.createdAt * 1000).toLocaleDateString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AsaasChargeCard({ charge: c }: { charge: AsaasCharge }) {
  const [showPix, setShowPix] = useState(false);
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-creme">{c.customerName}</span>
            <BillingTypeBadge type={c.billingType} />
            <ChargeStatusBadge status={c.status} />
          </div>
          <p className="text-[12px] text-creme-mute mt-1">{c.description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[18px] font-bold font-mono text-creme">R$ {c.value.toFixed(2)}</div>
          <div className="text-[10.5px] text-creme-faint font-mono">líq R$ {c.netValue.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-default text-[11px] font-mono text-creme-faint">
        <span><Clock size={10} className="inline mr-0.5" /> venc {new Date(c.dueDate).toLocaleDateString('pt-BR')}</span>
        {c.paymentDate && <span className="text-semantic-green"><CheckCircle2 size={10} className="inline mr-0.5" /> pago {new Date(c.paymentDate).toLocaleDateString('pt-BR')}</span>}
        <code className="text-creme-faint">{c.id}</code>

        <div className="ml-auto flex items-center gap-1.5">
          {c.billingType === 'PIX' && c.status === 'PENDING' && (
            <button onClick={() => setShowPix(!showPix)} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1">
              <QrCode size={10} /> {showPix ? 'Ocultar QR' : 'Ver QR Code'}
            </button>
          )}
          {c.billingType === 'BOLETO' && (
            <button className="px-2 py-1 rounded-md text-[11px] font-semibold bg-semantic-amber/15 text-semantic-amber inline-flex items-center gap-1">
              <Download size={10} /> Boleto
            </button>
          )}
          {c.status === 'PENDING' && (
            <button className="px-2 py-1 rounded-md text-[11px] font-semibold bg-brand/15 text-brand-bright inline-flex items-center gap-1">
              <Send size={10} /> Reenviar
            </button>
          )}
        </div>
      </div>

      {showPix && c.pixCopyPaste && (
        <div className="mt-3 pt-3 border-t border-default flex items-center gap-3">
          <div className="w-24 h-24 bg-creme rounded-md flex items-center justify-center shrink-0">
            <QrCode size={64} className="text-surface-1" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">PIX Copia & Cola</div>
            <code className="text-[10.5px] font-mono text-creme-mute break-all line-clamp-3">{c.pixCopyPaste}</code>
            <button className="mt-2 px-2 py-1 rounded-md text-[10.5px] font-semibold bg-surface-3 text-creme-mute inline-flex items-center gap-1">
              <Copy size={10} /> Copiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChargeStatusBadge({ status }: { status: AsaasChargeStatus }) {
  const map: Record<AsaasChargeStatus, { label: string; color: string; Icon: typeof Clock }> = {
    PENDING: { label: 'pendente', color: 'bg-semantic-amber/15 text-semantic-amber', Icon: Clock },
    RECEIVED: { label: 'recebida', color: 'bg-semantic-green/15 text-semantic-green', Icon: CheckCircle2 },
    CONFIRMED: { label: 'confirmada', color: 'bg-semantic-green/15 text-semantic-green', Icon: CheckCircle2 },
    OVERDUE: { label: 'vencida', color: 'bg-semantic-red/15 text-semantic-red', Icon: AlertTriangle },
    REFUNDED: { label: 'reembolsada', color: 'bg-surface-3 text-creme-mute', Icon: RotateCcw },
    CHARGEBACK: { label: 'chargeback', color: 'bg-semantic-red/15 text-semantic-red', Icon: XCircle },
  };
  const m = map[status];
  const I = m.Icon;
  return <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10.5px] font-mono', m.color)}><I size={9} /> {m.label}</span>;
}

function InvoiceStatusBadge({ status }: { status: StripeInvoice['status'] }) {
  const m = {
    paid: { color: 'bg-semantic-green/15 text-semantic-green', label: 'paga' },
    open: { color: 'bg-semantic-amber/15 text-semantic-amber', label: 'aberta' },
    draft: { color: 'bg-surface-3 text-creme-mute', label: 'draft' },
    uncollectible: { color: 'bg-semantic-red/15 text-semantic-red', label: 'incobrável' },
    void: { color: 'bg-surface-3 text-creme-faint', label: 'void' },
  }[status];
  return <span className={clsx('inline-flex items-center px-1.5 py-px rounded-full text-[10.5px] font-mono w-fit', m.color)}>{m.label}</span>;
}

function BillingTypeBadge({ type }: { type: AsaasBillingType }) {
  const m = {
    PIX: { color: 'bg-semantic-green/15 text-semantic-green', Icon: QrCode, label: 'PIX' },
    BOLETO: { color: 'bg-semantic-amber/15 text-semantic-amber', Icon: Receipt, label: 'Boleto' },
    CREDIT_CARD: { color: 'bg-brand/15 text-brand-bright', Icon: CreditCard, label: 'Cartão' },
    UNDEFINED: { color: 'bg-surface-3 text-creme-mute', Icon: FileText, label: '—' },
  }[type];
  const I = m.Icon;
  return <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10.5px] font-mono', m.color)}><I size={9} /> {m.label}</span>;
}

// ─── Refunds ──────────────────────────────────────────────────────────────
function RefundsPanel({ gateway }: { gateway: Gateway }) {
  const stripeRefunds = useMemo(() => SEED_STRIPE_REFUNDS, []);
  const asaasRefunds = useMemo(() => SEED_ASAAS_CHARGES.filter((c) => c.status === 'REFUNDED'), []);

  return (
    <>
      {(gateway === 'all' || gateway === 'stripe') && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-brand-bright mb-2 inline-flex items-center gap-1.5"><CreditCard size={11} /> Stripe</h3>
          <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-[1fr_160px_140px_120px_140px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
              <div>Charge ID</div><div>Motivo</div><div>Status</div><div>Valor</div><div>Quando</div>
            </div>
            {stripeRefunds.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_160px_140px_120px_140px] gap-3 px-4 py-2.5 border-t border-default text-[12px] hover:bg-surface-hover/30">
                <code className="font-mono text-creme-mute">{r.chargeId}</code>
                <code className="font-mono text-creme-dim text-[11px]">{r.reason}</code>
                <span className={clsx('inline-flex items-center px-1.5 py-px rounded-full text-[10.5px] font-mono w-fit', r.status === 'succeeded' ? 'bg-semantic-green/15 text-semantic-green' : r.status === 'failed' ? 'bg-semantic-red/15 text-semantic-red' : 'bg-semantic-amber/15 text-semantic-amber')}>
                  {r.status}
                </span>
                <div className="font-mono text-creme font-bold">US$ {(r.amount / 100).toFixed(2)}</div>
                <div className="text-[10.5px] font-mono text-creme-faint">{new Date(r.createdAt * 1000).toLocaleDateString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(gateway === 'all' || gateway === 'asaas') && asaasRefunds.length > 0 && (
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-semantic-green mb-2 inline-flex items-center gap-1.5"><QrCode size={11} /> Asaas</h3>
          <div className="space-y-2">
            {asaasRefunds.map((c) => <AsaasChargeCard key={c.id} charge={c} />)}
          </div>
        </div>
      )}

      {(gateway === 'all' || gateway === 'asaas') && asaasRefunds.length === 0 && gateway === 'asaas' && (
        <div className="text-[12.5px] text-creme-faint italic p-8 text-center">Nenhum refund Asaas /30d.</div>
      )}
    </>
  );
}
