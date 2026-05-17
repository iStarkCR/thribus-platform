/**
 * Asaas client — proxy via Supabase Edge Function `asaas-proxy`.
 *
 * Asaas é gateway BR — PIX, boleto, cartão. Chave fica no Supabase secrets.
 * Edge function recebe action + params, autentica com ASAAS_API_KEY e
 * devolve resultado.
 *
 * Sem edge function → cai pro mock.
 */

import { supabase } from '@/lib/supabase';

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  city?: string;
  createdAt: string;
  totalPaid: number;
  pendingAmount: number;
}

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
export type AsaasChargeStatus =
  | 'PENDING' | 'RECEIVED' | 'CONFIRMED'
  | 'OVERDUE' | 'REFUNDED' | 'CHARGEBACK';

export interface AsaasCharge {
  id: string;
  customerId: string;
  customerName: string;
  value: number;
  netValue: number;
  billingType: AsaasBillingType;
  status: AsaasChargeStatus;
  dueDate: string;
  paymentDate?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  boletoUrl?: string;
  invoiceUrl?: string;
  description: string;
}

export interface AsaasSubscription {
  id: string;
  customerId: string;
  customerName: string;
  value: number;
  cycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDueDate: string;
  billingType: AsaasBillingType;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  description: string;
}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado — Asaas proxy indisponível');
  const { data, error } = await supabase.functions.invoke('asaas-proxy', { body: { action, params } });
  if (error) throw error;
  return data as T;
}

export const asaasConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

export async function listCustomers(limit = 50): Promise<AsaasCustomer[]> {
  return call('customers.list', { limit });
}
export async function listCharges(status?: AsaasChargeStatus): Promise<AsaasCharge[]> {
  return call('charges.list', { status });
}
export async function listSubscriptions(): Promise<AsaasSubscription[]> {
  return call('subscriptions.list');
}
export async function createPixCharge(customerId: string, value: number, description: string, dueDate: string): Promise<AsaasCharge> {
  return call('charges.create', { customer: customerId, value, description, dueDate, billingType: 'PIX' });
}
export async function createBoleto(customerId: string, value: number, description: string, dueDate: string): Promise<AsaasCharge> {
  return call('charges.create', { customer: customerId, value, description, dueDate, billingType: 'BOLETO' });
}
export async function refundCharge(chargeId: string, value?: number): Promise<AsaasCharge> {
  return call('charges.refund', { id: chargeId, value });
}
