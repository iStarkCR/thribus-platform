/**
 * Cortex Enterprise — Billing. Pricing visual + integração Stripe.
 *
 * Requer JWT (de signup/signin) pra startCheckout/openPortal.
 */

import { useEffect, useState } from 'react';
import { Check, CreditCard, ExternalLink, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { cortexEnterprise, type Subscription } from '@/services/cortexEnterprise';

const LS_JWT = 'cortex.enterprise.jwt';
const LS_TENANT = 'cortex.enterprise.tenant_id';

interface PlanInfo {
  code: 'essencial' | 'business' | 'corporate';
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  highlights: string[];
  recommended?: boolean;
}

const PLANS: PlanInfo[] = [
  {
    code: 'essencial',
    name: 'Essencial',
    tagline: 'Times pequenos começando com IA',
    monthlyPrice: 7997,
    yearlyPrice: 76770,
    highlights: [
      'Cortex Brain + 2 colaboradores',
      '50k mensagens / mês',
      '2 módulos Enterprise',
      'Suporte por email',
    ],
  },
  {
    code: 'business',
    name: 'Business',
    tagline: 'Operação digital completa',
    monthlyPrice: 14997,
    yearlyPrice: 143970,
    highlights: [
      'Brain + 5 colaboradores',
      '200k mensagens / mês',
      'Todos os módulos',
      'Customer success dedicado',
      'SLA 99.5%',
    ],
    recommended: true,
  },
  {
    code: 'corporate',
    name: 'Corporate',
    tagline: 'Para empresas com volume e compliance',
    monthlyPrice: 29997,
    yearlyPrice: 287970,
    highlights: [
      'Volume customizado',
      'Customizações específicas',
      'SSO empresarial',
      'Dedicated success manager',
      'SLA 99.9% + compliance docs',
    ],
  },
];

export function EnterpriseBilling() {
  const [jwt, setJwt] = useState<string>(() => localStorage.getItem(LS_JWT) ?? '');
  const [tenantId, setTenantId] = useState<string>(() => localStorage.getItem(LS_TENANT) ?? '');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!jwt || !tenantId) return;
    void (async () => {
      try {
        const data = await cortexEnterprise.getSubscription(jwt, tenantId);
        setSub(data);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [jwt, tenantId]);

  async function startCheckout(plan: PlanInfo['code']) {
    if (!jwt || !tenantId) {
      setError('Configure JWT + tenant_id primeiro');
      return;
    }
    setLoadingPlan(plan);
    setError(null);
    try {
      const result = await cortexEnterprise.startCheckout(jwt, {
        tenant_id: tenantId,
        plan,
        cycle,
      });
      window.location.href = result.url;
    } catch (err) {
      setError((err as Error).message);
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    if (!jwt || !tenantId) return;
    try {
      const r = await cortexEnterprise.openPortal(jwt, tenantId);
      window.location.href = r.url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      {/* Auth state */}
      <div className="rounded-xl border border-default bg-surface-1 p-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
            JWT (de /cortex/auth/signin)
          </span>
          <input
            value={jwt}
            onChange={(e) => {
              setJwt(e.target.value);
              localStorage.setItem(LS_JWT, e.target.value);
            }}
            type="password"
            placeholder="eyJ…"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
          />
        </label>
        <label className="block">
          <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
            Tenant ID
          </span>
          <input
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              localStorage.setItem(LS_TENANT, e.target.value);
            }}
            placeholder="uuid do tenant"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
          />
        </label>
      </div>

      {/* Subscription atual */}
      {sub && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-emerald-300" />
            <div>
              <div className="text-[13px] font-bold text-emerald-200">
                Assinatura ativa: {sub.plan_code} ({sub.billing_cycle})
              </div>
              <div className="text-[12px] text-emerald-200/70">
                Status: {sub.status}
                {sub.current_period_end && ` · próximo ciclo: ${new Date(sub.current_period_end).toLocaleDateString('pt-BR')}`}
              </div>
            </div>
          </div>
          <button
            onClick={openPortal}
            className="text-[12.5px] font-bold text-emerald-200 hover:text-emerald-100 flex items-center gap-1"
          >
            Gerenciar
            <ExternalLink size={11} />
          </button>
        </div>
      )}

      {/* Cycle switch */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => setCycle('monthly')}
          className={clsx(
            'px-4 py-1.5 rounded-lg text-[13px] font-bold',
            cycle === 'monthly' ? 'bg-surface-3 text-creme' : 'text-creme-mute hover:text-creme-dim',
          )}
        >
          Mensal
        </button>
        <button
          onClick={() => setCycle('yearly')}
          className={clsx(
            'px-4 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5',
            cycle === 'yearly' ? 'bg-surface-3 text-creme' : 'text-creme-mute hover:text-creme-dim',
          )}
        >
          Anual
          <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
            -20%
          </span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLANS.map((p) => {
          const price = cycle === 'monthly' ? p.monthlyPrice : p.yearlyPrice;
          const isCurrent = sub?.plan_code === p.code && sub?.billing_cycle === cycle;
          return (
            <div
              key={p.code}
              className={clsx(
                'rounded-xl border p-5 relative flex flex-col',
                p.recommended
                  ? 'border-brand bg-brand/5'
                  : 'border-default bg-surface-1',
              )}
            >
              {p.recommended && (
                <div className="absolute -top-2.5 left-5 px-2 py-0.5 rounded bg-brand text-bg text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={10} />
                  Mais escolhido
                </div>
              )}
              <h3 className="text-[18px] font-extrabold text-creme">{p.name}</h3>
              <p className="text-[12.5px] text-creme-mute mt-1">{p.tagline}</p>

              <div className="mt-4">
                <div className="text-[24px] font-extrabold text-creme">
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    maximumFractionDigits: 0,
                  }).format(price)}
                </div>
                <div className="text-[11.5px] text-creme-faint">
                  /{cycle === 'monthly' ? 'mês' : 'ano'}
                </div>
              </div>

              <ul className="mt-4 space-y-2 flex-1">
                {p.highlights.map((h) => (
                  <li
                    key={h}
                    className="text-[12.5px] text-creme-mute flex items-start gap-2 leading-relaxed"
                  >
                    <Check size={13} className="text-emerald-300 mt-0.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startCheckout(p.code)}
                disabled={!jwt || !tenantId || isCurrent || loadingPlan === p.code}
                className={clsx(
                  'mt-5 w-full px-3 py-2.5 rounded-lg font-bold text-[13px] flex items-center justify-center gap-2',
                  isCurrent
                    ? 'bg-emerald-500/10 text-emerald-300 cursor-default'
                    : p.recommended
                      ? 'bg-brand hover:bg-brand-bright text-bg'
                      : 'bg-surface-3 hover:bg-surface-4 text-creme',
                  'disabled:opacity-50',
                )}
              >
                {loadingPlan === p.code ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Redirecionando…
                  </>
                ) : isCurrent ? (
                  <>
                    <Check size={13} /> Plano atual
                  </>
                ) : (
                  <>
                    <CreditCard size={13} /> Assinar
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[12px] text-creme-faint">
        Pagamentos processados via Stripe. Cancele a qualquer momento pelo portal de billing.
      </div>
    </div>
  );
}
