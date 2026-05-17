/**
 * IXC client — proxy via Supabase Edge Function.
 *
 * IXC não pode ser chamado direto do browser (auth + CORS + segurança).
 * Solução: edge function `/functions/v1/ixc-proxy` que recebe action + params,
 * autentica com IXC_TOKEN+IXC_HASH (env do Supabase) e devolve resultado.
 *
 * Quando a edge function não existir, cai pro mock automaticamente.
 */

import { supabase } from '@/lib/supabase';

export interface IxcClient {
  id: number;
  razao: string;
  cnpj_cpf: string;
  telefone_celular: string;
  email?: string;
  cidade: string;
  ativo: 'S' | 'N';
  data_cadastro: string;
}

export interface IxcContract {
  id: number;
  id_cliente: number;
  produto: string;
  status: 'A' | 'I' | 'C' | 'D';
  mensalidade: number;
  data_ativacao: string;
}

export interface IxcInvoice {
  id: number;
  id_cliente: number;
  valor: number;
  data_vencimento: string;
  status: 'A' | 'R' | 'C';
  link_boleto?: string;
}

async function callProxy<T>(action: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado — IXC proxy indisponível');
  const { data, error } = await supabase.functions.invoke('ixc-proxy', { body: { action, params } });
  if (error) throw error;
  return data as T;
}

export async function fetchClientByPhone(phone: string): Promise<IxcClient | null> {
  return callProxy<IxcClient | null>('client.by_phone', { phone });
}

export async function fetchClientByDocument(doc: string): Promise<IxcClient | null> {
  return callProxy<IxcClient | null>('client.by_document', { doc });
}

export async function fetchActiveContracts(clientId: number): Promise<IxcContract[]> {
  return callProxy<IxcContract[]>('contracts.active', { client_id: clientId });
}

export async function fetchOpenInvoices(clientId: number): Promise<IxcInvoice[]> {
  return callProxy<IxcInvoice[]>('invoices.open', { client_id: clientId });
}

export async function checkViability(zip: string, number: string): Promise<{ available: boolean; tech: string; max_mbps: number }> {
  return callProxy('viability.check', { zip, number });
}

export const ixcConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);
