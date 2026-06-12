/**
 * Cortex M2 — Módulo Faturamento BR.
 *
 * Boleto + PIX + cartão recorrente via Asaas. NF.e via NFe.io.
 * Régua de cobrança automática (Marcos dispara via workflow).
 *
 * Com ASAAS_API_KEY no env, cria customer + payment reais no Asaas.
 * Com NFEIO_API_KEY + NFEIO_COMPANY_ID, emite NF.e real via NFe.io.
 * Sem as keys, opera em modo stub explícito (response carrega stub: true).
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

async function asaasRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY!,
      ...(init?.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`asaas_${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

async function asaasFindOrCreateCustomer(name: string, document?: string): Promise<string> {
  const cpfCnpj = document?.replace(/\D/g, '');
  if (cpfCnpj) {
    const found = await asaasRequest<{ data: Array<{ id: string }> }>(
      `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    );
    if (found.data.length > 0) return found.data[0].id;
  }
  const created = await asaasRequest<{ id: string }>('/customers', {
    method: 'POST',
    body: JSON.stringify({ name, cpfCnpj }),
  });
  return created.id;
}

const ASAAS_BILLING_TYPE: Record<string, string> = {
  boleto: 'BOLETO',
  pix: 'PIX',
  card: 'CREDIT_CARD',
};

async function asaasCreateCharge(invoice: {
  customer_name: string;
  customer_document?: string;
  amount: number;
  due_date: string;
  description: string;
  payment_method: 'boleto' | 'pix' | 'card';
}): Promise<{ id: string; pix_qrcode?: string; boleto_url?: string; barcode?: string } | null> {
  if (!ASAAS_API_KEY) return null;

  const customerId = await asaasFindOrCreateCustomer(invoice.customer_name, invoice.customer_document);
  const payment = await asaasRequest<{ id: string; bankSlipUrl?: string; invoiceUrl?: string }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: ASAAS_BILLING_TYPE[invoice.payment_method],
      value: invoice.amount,
      dueDate: invoice.due_date,
      description: invoice.description.slice(0, 500),
    }),
  });

  let pixQrcode: string | undefined;
  let barcode: string | undefined;
  if (invoice.payment_method === 'pix') {
    try {
      const qr = await asaasRequest<{ payload: string }>(`/payments/${payment.id}/pixQrCode`);
      pixQrcode = qr.payload;
    } catch {
      // QR pode demorar a ficar disponível — invoice fica sem, consulta depois
    }
  }
  if (invoice.payment_method === 'boleto') {
    try {
      const field = await asaasRequest<{ identificationField: string }>(`/payments/${payment.id}/identificationField`);
      barcode = field.identificationField;
    } catch {
      // linha digitável pode não estar pronta na criação
    }
  }

  return {
    id: payment.id,
    pix_qrcode: pixQrcode,
    boleto_url: payment.bankSlipUrl ?? payment.invoiceUrl,
    barcode,
  };
}

// ─── NF.e via NFe.io ─────────────────────────────────────────────────────────
const NFEIO_API_KEY = process.env.NFEIO_API_KEY;
const NFEIO_COMPANY_ID = process.env.NFEIO_COMPANY_ID;
const NFEIO_CITY_SERVICE_CODE = process.env.NFEIO_CITY_SERVICE_CODE;

async function nfeioIssueServiceInvoice(invoice: {
  customer_name: string;
  customer_email?: string | null;
  customer_document?: string | null;
  description: string;
  amount: number;
}): Promise<{ id: string } | null> {
  if (!NFEIO_API_KEY || !NFEIO_COMPANY_ID) return null;
  const federalTaxNumber = invoice.customer_document?.replace(/\D/g, '');
  const resp = await fetch(`https://api.nfe.io/v1/companies/${NFEIO_COMPANY_ID}/serviceinvoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: NFEIO_API_KEY,
    },
    body: JSON.stringify({
      borrower: {
        name: invoice.customer_name,
        email: invoice.customer_email ?? undefined,
        federalTaxNumber: federalTaxNumber ? Number(federalTaxNumber) : undefined,
      },
      cityServiceCode: NFEIO_CITY_SERVICE_CODE ?? undefined,
      description: invoice.description.slice(0, 600),
      servicesAmount: invoice.amount,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`nfeio_${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  return { id: data.id ?? '' };
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
    // Cria charge real no Asaas quando ASAAS_API_KEY presente.
    // Falha no provider não bloqueia a invoice local — registra o erro na resposta.
    let providerRefs: Awaited<ReturnType<typeof asaasCreateCharge>> = null;
    let providerError: string | null = null;
    if (body.payment_method) {
      try {
        providerRefs = await asaasCreateCharge({
          customer_name: body.customer_name,
          customer_document: body.customer_document,
          amount: body.amount,
          due_date: body.due_date,
          description: body.description,
          payment_method: body.payment_method,
        });
      } catch (err) {
        providerError = (err as Error).message;
        console.warn('[billing-br] asaas falhou:', providerError);
      }
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
    res.status(201).json({
      invoice: data,
      provider_stub: !ASAAS_API_KEY,
      ...(providerError ? { provider_error: providerError } : {}),
    });
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

  // NF.e — real via NFe.io quando NFEIO_API_KEY + NFEIO_COMPANY_ID configurados
  router.post('/invoices/:id/issue-nfe', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;

    const { data: invoice } = await supabase!
      .from('cortex_billing_invoices')
      .select('id, customer_name, customer_email, customer_document, description, amount, nfe_status')
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (!invoice) return void res.status(404).json({ error: 'invoice not found' });
    if (invoice.nfe_status === 'processing' || invoice.nfe_status === 'issued') {
      return void res.status(409).json({ error: `nfe já em status ${invoice.nfe_status}` });
    }

    if (!NFEIO_API_KEY || !NFEIO_COMPANY_ID) {
      // Sem provider configurado — registra intenção e sinaliza stub explicitamente
      const { data } = await supabase!.from('cortex_billing_invoices').update({
        nfe_status: 'processing',
        nfe_number: `NFE-STUB-${Date.now()}`,
      }).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
      return void res.json({ invoice: data, stub: true, message: 'configurar NFEIO_API_KEY + NFEIO_COMPANY_ID pra emissão real' });
    }

    try {
      const issued = await nfeioIssueServiceInvoice({
        customer_name: invoice.customer_name as string,
        customer_email: invoice.customer_email as string | null,
        customer_document: invoice.customer_document as string | null,
        description: invoice.description as string,
        amount: Number(invoice.amount),
      });
      // NFe.io processa async — webhook de status atualiza pra 'issued' com número final
      const { data } = await supabase!.from('cortex_billing_invoices').update({
        nfe_status: 'processing',
        nfe_number: issued?.id ?? null,
      }).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
      res.json({ invoice: data, stub: false });
    } catch (err) {
      const msg = (err as Error).message;
      await supabase!.from('cortex_billing_invoices').update({ nfe_status: 'failed' })
        .eq('tenant_id', tenantId).eq('id', req.params.id);
      res.status(502).json({ error: 'nfe_issue_failed', message: msg });
    }
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
