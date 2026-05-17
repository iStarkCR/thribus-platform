/**
 * Stripe client — proxy via Supabase Edge Function `stripe-proxy`.
 *
 * Secret key (sk_live_... ou sk_test_...) NUNCA pode estar no browser.
 * Edge function recebe action + params, autentica com STRIPE_SECRET_KEY
 * (env do Supabase) e devolve resultado já filtrado/anonimizado.
 *
 * Sem edge function deployada → cai pro mock automaticamente.
 */

import { supabase } from '@/lib/supabase';

export interface StripeCustomer {
  id: string;
  email: string;
  name: string;
  created: number;
  defaultPaymentMethod?: string;
  subscriptionsCount: number;
  totalSpent: number;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  customerName: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  product: string;
  amount: number;
  interval: 'month' | 'year';
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

export interface StripeInvoice {
  id: string;
  customerId: string;
  customerName: string;
  number: string;
  amount: number;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  hostedInvoiceUrl?: string;
  createdAt: number;
  dueDate?: number;
}

export interface StripeRefund {
  id: string;
  chargeId: string;
  amount: number;
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  status: 'succeeded' | 'failed' | 'pending';
  createdAt: number;
}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado — Stripe proxy indisponível');
  const { data, error } = await supabase.functions.invoke('stripe-proxy', { body: { action, params } });
  if (error) throw error;
  return data as T;
}

export const stripeConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

export async function listCustomers(limit = 50): Promise<StripeCustomer[]> {
  return call('customers.list', { limit });
}
export async function listSubscriptions(status?: StripeSubscription['status']): Promise<StripeSubscription[]> {
  return call('subscriptions.list', { status });
}
export async function listInvoices(status?: StripeInvoice['status'], limit = 50): Promise<StripeInvoice[]> {
  return call('invoices.list', { status, limit });
}
export async function listRefunds(limit = 50): Promise<StripeRefund[]> {
  return call('refunds.list', { limit });
}
export async function createRefund(chargeId: string, amount?: number, reason?: StripeRefund['reason']): Promise<StripeRefund> {
  return call('refunds.create', { charge_id: chargeId, amount, reason });
}
export async function cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<StripeSubscription> {
  return call('subscriptions.cancel', { id: subscriptionId, at_period_end: atPeriodEnd });
}
