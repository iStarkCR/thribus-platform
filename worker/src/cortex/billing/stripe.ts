/**
 * Cortex Enterprise — Billing (Stripe integration).
 *
 * Approach: faz chamadas HTTP diretas pra Stripe API (sem SDK extra), pra
 * manter dependências mínimas. Foco em 3 endpoints:
 *   - POST /cortex/billing/checkout       → cria Checkout Session pro plano
 *   - POST /cortex/billing/portal         → cria Billing Portal session pro tenant
 *   - POST /cortex/billing/webhook        → recebe eventos Stripe e atualiza DB
 *
 * Stripe secrets via env:
 *   STRIPE_SECRET_KEY            sk_live_… ou sk_test_…
 *   STRIPE_WEBHOOK_SECRET        whsec_…
 *
 * Price IDs por plano via env (configure no Stripe Dashboard e cole aqui):
 *   STRIPE_PRICE_ESSENCIAL_MONTHLY
 *   STRIPE_PRICE_ESSENCIAL_YEARLY
 *   STRIPE_PRICE_BUSINESS_MONTHLY
 *   STRIPE_PRICE_BUSINESS_YEARLY
 *   STRIPE_PRICE_CORPORATE_MONTHLY
 *   STRIPE_PRICE_CORPORATE_YEARLY
 *
 * Auth do checkout/portal: Bearer JWT (de /cortex/auth/signin) — o usuário
 * tem que pertencer ao tenant que está sendo assinado.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { verifyJwt } from '../auth/sso.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger('cortex.billing');

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

const PRICE_MAP: Record<string, string | undefined> = {
  'essencial:monthly': process.env.STRIPE_PRICE_ESSENCIAL_MONTHLY,
  'essencial:yearly': process.env.STRIPE_PRICE_ESSENCIAL_YEARLY,
  'business:monthly': process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
  'business:yearly': process.env.STRIPE_PRICE_BUSINESS_YEARLY,
  'corporate:monthly': process.env.STRIPE_PRICE_CORPORATE_MONTHLY,
  'corporate:yearly': process.env.STRIPE_PRICE_CORPORATE_YEARLY,
};

export const billingConfigured = !!STRIPE_KEY;

// ─── Stripe helper (HTTP form-urlencoded) ─────────────────────────────────

interface StripeError {
  error?: { message: string; type: string };
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  const body = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : undefined;
  const resp = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await resp.json().catch(() => ({})) as T & StripeError;
  if (!resp.ok) {
    throw new Error(
      (data as StripeError).error?.message ?? `stripe_http_${resp.status}`,
    );
  }
  return data;
}

// ─── Webhook signature verification ────────────────────────────────────────

function verifyWebhookSignature(payload: string, header: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !header) return false;
  const elements = header.split(',');
  const timestamp = elements.find((e) => e.startsWith('t='))?.slice(2);
  const sig = elements.find((e) => e.startsWith('v1='))?.slice(3);
  if (!timestamp || !sig) return false;
  const signed = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(signed).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Auth helper (JWT) ────────────────────────────────────────────────────

async function authUser(req: Request): Promise<{ userId: string; tenants: string[] } | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  if (!supabase) return { userId: payload.sub, tenants: [] };
  const { data } = await supabase
    .from('cortex_user_tenants')
    .select('tenant_id')
    .eq('user_id', payload.sub);
  return {
    userId: payload.sub,
    tenants: (data ?? []).map((d) => d.tenant_id as string),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────

export function createBillingRouter(): Router {
  const router = Router();

  // Webhook precisa do raw body — montar ANTES do express.json()
  router.post(
    '/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req: Request, res: Response) => {
      const sig = req.headers['stripe-signature'] as string | undefined;
      const rawBody = (req.body as Buffer).toString('utf8');
      if (!verifyWebhookSignature(rawBody, sig)) {
        res.status(400).send('bad_signature');
        return;
      }
      let event: { type: string; data: { object: Record<string, unknown> } };
      try {
        event = JSON.parse(rawBody);
      } catch {
        res.status(400).send('invalid_json');
        return;
      }
      await handleStripeEvent(event).catch((err) =>
        logger.error('webhook handler failed', { error: (err as Error).message, type: event.type }),
      );
      res.json({ received: true });
    },
  );

  // Demais endpoints com json normal
  router.use(express.json({ limit: '128kb' }));

  router.post('/checkout', async (req: Request, res: Response) => {
    if (!billingConfigured) {
      res.status(503).json({ error: 'stripe not configured' });
      return;
    }
    const auth = await authUser(req);
    if (!auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body as {
      tenant_id?: string;
      plan?: 'essencial' | 'business' | 'corporate';
      cycle?: 'monthly' | 'yearly';
      success_url?: string;
      cancel_url?: string;
    };
    if (!body.tenant_id || !body.plan || !body.cycle) {
      res.status(400).json({ error: 'tenant_id, plan e cycle obrigatórios' });
      return;
    }
    if (!auth.tenants.includes(body.tenant_id)) {
      res.status(403).json({ error: 'forbidden_tenant' });
      return;
    }
    const priceKey = `${body.plan}:${body.cycle}`;
    const priceId = PRICE_MAP[priceKey];
    if (!priceId) {
      res.status(400).json({ error: `price_not_configured: ${priceKey}` });
      return;
    }
    try {
      const session = await stripeRequest<{ id: string; url: string }>(
        'POST',
        '/checkout/sessions',
        {
          mode: 'subscription',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': 1,
          success_url:
            body.success_url ?? 'https://cortex.thribus.com.br/billing/success',
          cancel_url:
            body.cancel_url ?? 'https://cortex.thribus.com.br/billing/cancel',
          'metadata[tenant_id]': body.tenant_id,
          'metadata[plan]': body.plan,
          'metadata[cycle]': body.cycle,
          client_reference_id: body.tenant_id,
        },
      );
      res.json({ url: session.url, session_id: session.id });
    } catch (err) {
      logger.error('checkout failed', { error: (err as Error).message });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/portal', async (req: Request, res: Response) => {
    if (!billingConfigured) {
      res.status(503).json({ error: 'stripe not configured' });
      return;
    }
    const auth = await authUser(req);
    if (!auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body as { tenant_id?: string; return_url?: string };
    if (!body.tenant_id || !auth.tenants.includes(body.tenant_id)) {
      res.status(403).json({ error: 'forbidden_tenant' });
      return;
    }
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    const { data: sub } = await supabase
      .from('cortex_subscriptions')
      .select('stripe_customer_id')
      .eq('tenant_id', body.tenant_id)
      .maybeSingle();
    if (!sub?.stripe_customer_id) {
      res.status(404).json({ error: 'no_subscription' });
      return;
    }
    try {
      const session = await stripeRequest<{ url: string }>(
        'POST',
        '/billing_portal/sessions',
        {
          customer: sub.stripe_customer_id,
          return_url: body.return_url ?? 'https://cortex.thribus.com.br',
        },
      );
      res.json({ url: session.url });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/subscription/:tenantId', async (req: Request, res: Response) => {
    const auth = await authUser(req);
    if (!auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!auth.tenants.includes(req.params.tenantId)) {
      res.status(403).json({ error: 'forbidden_tenant' });
      return;
    }
    if (!supabase) {
      res.json({ subscription: null });
      return;
    }
    const { data } = await supabase
      .from('cortex_subscriptions')
      .select('*')
      .eq('tenant_id', req.params.tenantId)
      .maybeSingle();
    res.json({ subscription: data });
  });

  return router;
}

// ─── Webhook handler ──────────────────────────────────────────────────────

async function handleStripeEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  if (!supabase) return;

  const obj = event.data.object;
  logger.info('stripe event', { type: event.type, id: obj.id });

  switch (event.type) {
    case 'checkout.session.completed': {
      const tenantId = (obj.metadata as Record<string, string> | undefined)?.tenant_id;
      const customerId = obj.customer as string | undefined;
      const subId = obj.subscription as string | undefined;
      if (!tenantId || !customerId || !subId) return;
      const plan =
        (obj.metadata as Record<string, string> | undefined)?.plan ?? 'essencial';
      const cycle =
        (obj.metadata as Record<string, string> | undefined)?.cycle ?? 'monthly';
      await supabase
        .from('cortex_subscriptions')
        .upsert(
          {
            tenant_id: tenantId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId,
            plan_code: plan,
            billing_cycle: cycle,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'stripe_subscription_id' },
        );
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subId = obj.id as string;
      const status = obj.status as string;
      const cancelAtEnd = obj.cancel_at_period_end as boolean;
      const periodStart = obj.current_period_start as number | undefined;
      const periodEnd = obj.current_period_end as number | undefined;
      await supabase
        .from('cortex_subscriptions')
        .update({
          status,
          cancel_at_period_end: cancelAtEnd,
          current_period_start: periodStart
            ? new Date(periodStart * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subId);
      break;
    }
    default:
      // Outros eventos (invoice.paid, payment_failed) — log apenas
      logger.debug('stripe event unhandled', { type: event.type });
  }
}
