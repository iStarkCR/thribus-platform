/**
 * Edge Function: stripe-proxy
 *
 * Proxy seguro pra Stripe API — chave secreta NUNCA vai pro browser.
 * Frontend chama via `supabase.functions.invoke('stripe-proxy', { body: { action, params } })`.
 *
 * Setup:
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
 *   supabase functions deploy stripe-proxy
 *
 * Actions suportadas:
 *   customers.list
 *   subscriptions.list, subscriptions.cancel
 *   invoices.list
 *   refunds.list, refunds.create
 */

// @ts-expect-error — Deno runtime
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';

// @ts-expect-error — Deno global
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_BASE = 'https://api.stripe.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function stripeCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? `Stripe ${res.status}`);
  return body as T;
}

// URL-encode params (Stripe usa form-encoded)
function encode(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

interface StripeListResp<T> { data: T[]; has_more: boolean }
interface StripeCustomer { id: string; email: string; name: string; created: number; default_source?: string }
interface StripeSubscription {
  id: string; customer: string; status: string;
  items: { data: { price: { product: string; unit_amount: number; recurring: { interval: string } } }[] };
  current_period_end: number; cancel_at_period_end: boolean;
}
interface StripeInvoice {
  id: string; customer: string; number: string; amount_due: number; status: string;
  hosted_invoice_url?: string; created: number; due_date?: number;
}
interface StripeRefund { id: string; charge: string; amount: number; reason: string; status: string; created: number }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { action, params = {} } = await req.json();

    switch (action) {
      case 'customers.list': {
        const list = await stripeCall<StripeListResp<StripeCustomer>>(`/customers?${encode({ limit: params.limit ?? 50 })}`);
        return ok(list.data.map((c) => ({
          id: c.id, email: c.email, name: c.name, created: c.created,
          subscriptionsCount: 0, totalSpent: 0,
        })));
      }

      case 'subscriptions.list': {
        const list = await stripeCall<StripeListResp<StripeSubscription>>(`/subscriptions?${encode({ limit: 100, status: params.status ?? 'all', expand: ['data.customer'] })}`);
        return ok(list.data.map((s) => ({
          id: s.id, customerId: s.customer, customerName: '', status: s.status,
          product: s.items.data[0]?.price.product ?? '',
          amount: s.items.data[0]?.price.unit_amount ?? 0,
          interval: s.items.data[0]?.price.recurring.interval ?? 'month',
          currentPeriodEnd: s.current_period_end, cancelAtPeriodEnd: s.cancel_at_period_end,
        })));
      }

      case 'subscriptions.cancel': {
        const data = await stripeCall<StripeSubscription>(`/subscriptions/${params.id}`, {
          method: 'POST',
          body: encode({ cancel_at_period_end: params.at_period_end ?? true }),
        });
        return ok(data);
      }

      case 'invoices.list': {
        const list = await stripeCall<StripeListResp<StripeInvoice>>(`/invoices?${encode({ limit: params.limit ?? 50, status: params.status })}`);
        return ok(list.data.map((i) => ({
          id: i.id, customerId: i.customer, customerName: '', number: i.number,
          amount: i.amount_due, status: i.status,
          hostedInvoiceUrl: i.hosted_invoice_url, createdAt: i.created, dueDate: i.due_date,
        })));
      }

      case 'refunds.list': {
        const list = await stripeCall<StripeListResp<StripeRefund>>(`/refunds?${encode({ limit: params.limit ?? 50 })}`);
        return ok(list.data.map((r) => ({
          id: r.id, chargeId: r.charge, amount: r.amount,
          reason: r.reason, status: r.status, createdAt: r.created,
        })));
      }

      case 'refunds.create': {
        const data = await stripeCall<StripeRefund>('/refunds', {
          method: 'POST',
          body: encode({ charge: params.charge_id, amount: params.amount, reason: params.reason }),
        });
        return ok(data);
      }

      default:
        return new Response(JSON.stringify({ error: `unknown action: ${action}` }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('[stripe-proxy] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

function ok<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
