/**
 * Cortex M2 — Módulo Faturamento BR.
 *
 * Boleto + PIX + cartão recorrente via Asaas (stub). NF.e via NFe.io (stub).
 * Régua de cobrança automática (Marcos dispara via workflow).
 *
 * V1 desse módulo: schema + CRUD + stubs de integração. Asaas real vem com
 * config das credenciais reais (ASAAS_API_KEY) no env.
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import { emit } from '../webhooks/outgoing.js';
import type { ModuleDefinition } from './types.js';

export const billingBrModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'billing-br',
  name: 'Faturamento BR',
  slug: 'faturamento-br',
  description: 'Faturamento BR completo: boleto, PIX, cartão (Asaas), emissão de NF.e (NFe.io), régua de cobrança automatizada.',
  category: 'finance',
  version: '0.1.0-beta',
  status: 'beta',
  icon: 'Receipt',
  tags: ['boleto', 'pix', 'nfe', 'cobrança', 'asaas'],
};

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL ?? 'https://api.asaas.com/v3';

async function asaasCreateCharge(invoice: {
  customer_name: string;
  customer_document?: string;
  amount: number;
  due_date: string;
  description: string;
  payment_method: 'boleto' | 'pix' | 'card';
}): Promise<{ id: string; pix_qrcode?: string; boleto_url?: string; barcode?: string } | null> {
  if (!ASAAS_API_KEY) return null;
  // Implementação real: criar customer + payment no Asaas, retornar refs
  // Stub: simula que conseguiu criar
  return {
    id: `pay_stub_${Date.now()}`,
    pix_qrcode: invoice.payment_method === 'pix' ? '00020126...' : undefined,
    boleto_url: invoice.payment_method === 'boleto' ? `${ASAAS_BASE_URL}/boleto/stub` : undefined,
  };
}

async function tid(req: Request, res: Response): Promise<string | null> {
  const t = await authenticate(req.headers.authorization as string | undefined);
  if (!t) return void res.status(401).json({ error: 'unauthorized' }), null;
  return t.tenantId;
}

function sb(res: Response): boolean {
  if (!supabase) return void res.status(503).json({ error: 'supabase not configured' }), false;
  return true;
}

export function buildBillingBrRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  router.get('/invoices', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let q = supabase!.from('cortex_billing_invoices').select('*').eq('tenant_id', tenantId).order('due_date', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    const { data } = await q;
    res.json({ invoices: data });
  });

  router.post('/invoices', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as {
      customer_name?: string;
      customer_document?: string;
      customer_email?: string;
      description?: string;
      amount?: number;
      due_date?: string;
      payment_method?: 'boleto' | 'pix' | 'card';
      items?: unknown[];
    };
    if (!body.customer_name || !body.description || !body.amount || !body.due_date) {
      return void res.status(400).json({ error: 'customer_name, description, amount, due_date obrigatórios' });
    }
    // Tenta criar charge no provider (stub se sem env)
    let providerRefs: Awaited<ReturnType<typeof asaasCreateCharge>> = null;
    if (body.payment_method) {
      providerRefs = await asaasCreateCharge({
        customer_name: body.customer_name,
        customer_document: body.customer_document,
        amount: body.amount,
        due_date: body.due_date,
        description: body.description,
        payment_method: body.payment_method,
      });
    }
    const { data, error } = await supabase!.from('cortex_billing_invoices').insert({
      tenant_id: tenantId,
      customer_name: body.customer_name,
      customer_document: body.customer_document ?? null,
      customer_email: body.customer_email ?? null,
      description: body.description,
      amount: body.amount,
      due_date: body.due_date,
      status: 'pending',
      payment_method: body.payment_method ?? null,
      pix_qrcode: providerRefs?.pix_qrcode ?? null,
      boleto_url: providerRefs?.boleto_url ?? null,
      boleto_barcode: providerRefs?.barcode ?? null,
      provider: providerRefs ? 'asaas' : null,
      provider_id: providerRefs?.id ?? null,
      items: body.items ?? [],
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    void emit({ type: 'invoice.created', tenantId, data: { invoice: data } });
    res.status(201).json({ invoice: data, provider_stub: !ASAAS_API_KEY });
  });

  router.patch('/invoices/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const allowed = ['customer_name', 'customer_email', 'description', 'amount', 'due_date', 'status', 'paid_at', 'nfe_url', 'nfe_status', 'notes', 'items'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!.from('cortex_billing_invoices').update(patch).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    if (patch.status === 'paid') {
      void emit({ type: 'invoice.paid', tenantId, data: { invoice: data } });
    }
    res.json({ invoice: data });
  });

  // NF.e — stub
  router.post('/invoices/:id/issue-nfe', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    // Stub: marca como pendente; em produção, chama NFe.io e webhook atualiza
    const { data } = await supabase!.from('cortex_billing_invoices').update({
      nfe_status: 'processing',
      nfe_number: `NFE-STUB-${Date.now()}`,
    }).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    res.json({ invoice: data, stub: true, message: 'configurar NFEIO_API_KEY pra emissão real' });
  });

  // Métricas: inadimplência + a receber
  router.get('/metrics', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: pending } = await supabase!.from('cortex_billing_invoices').select('amount, status, due_date').eq('tenant_id', tenantId).in('status', ['pending', 'overdue']);
    let to_receive = 0;
    let overdue = 0;
    for (const inv of pending ?? []) {
      const v = Number(inv.amount ?? 0);
      to_receive += v;
      if ((inv.due_date as string) < today) overdue += v;
    }
    res.json({ to_receive, overdue, currency: 'BRL' });
  });

  return router;
}
