/**
 * Edge Function: asaas-proxy
 *
 * Proxy seguro pra Asaas API (gateway BR — PIX/boleto/cartão).
 * Chave secreta NUNCA vai pro browser.
 *
 * Setup:
 *   supabase secrets set ASAAS_API_KEY=$aact_prod_xxx
 *   supabase secrets set ASAAS_BASE_URL=https://api.asaas.com/v3
 *     (ou https://sandbox.asaas.com/api/v3 em homologação)
 *   supabase functions deploy asaas-proxy
 *
 * Actions:
 *   customers.list
 *   charges.list, charges.create, charges.refund
 *   charges.get        — público, read-only (página de pagamento Thribus)
 *   subscriptions.list
 */

// @ts-expect-error — Deno runtime
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';

// @ts-expect-error — Deno global
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY')!;
// @ts-expect-error — Deno global
const ASAAS_BASE = Deno.env.get('ASAAS_BASE_URL') ?? 'https://api.asaas.com/v3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function asaasCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: {
      access_token: ASAAS_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'Thribus-Platform/1.0',
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.errors?.[0]?.description ?? `Asaas ${res.status}`);
  return body as T;
}

interface AsaasListResp<T> { data: T[]; hasMore: boolean; totalCount: number }
interface AsaasCustomerRaw {
  id: string; name: string; cpfCnpj: string; email?: string; mobilePhone?: string; phone?: string;
  city?: string; dateCreated: string;
}
interface AsaasFee { value?: number; type?: string }
interface AsaasDiscount { value?: number; dueDateLimitDays?: number; type?: string }
interface AsaasChargeRaw {
  id: string; customer: string; value: number; netValue: number;
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  status: string; dueDate: string; paymentDate?: string;
  invoiceUrl?: string; bankSlipUrl?: string; invoiceNumber?: string;
  identificationField?: string; description: string;
  fine?: AsaasFee; interest?: AsaasFee; discount?: AsaasDiscount;
}
interface AsaasSubscriptionRaw {
  id: string; customer: string; value: number; cycle: string;
  nextDueDate: string; billingType: string; status: string; description: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { action, params = {} } = await req.json();

    switch (action) {
      case 'customers.list': {
        const list = await asaasCall<AsaasListResp<AsaasCustomerRaw>>(`/customers?limit=${params.limit ?? 50}`);
        return ok(list.data.map((c) => ({
          id: c.id, name: c.name, cpfCnpj: c.cpfCnpj, email: c.email,
          phone: c.mobilePhone ?? c.phone, city: c.city,
          createdAt: c.dateCreated, totalPaid: 0, pendingAmount: 0,
        })));
      }

      case 'charges.list': {
        const qs = new URLSearchParams({ limit: '50' });
        if (params.status) qs.set('status', params.status);
        const list = await asaasCall<AsaasListResp<AsaasChargeRaw>>(`/payments?${qs}`);
        return ok(list.data.map((c) => ({
          id: c.id, customerId: c.customer, customerName: '',
          value: c.value, netValue: c.netValue,
          billingType: c.billingType, status: c.status,
          dueDate: c.dueDate, paymentDate: c.paymentDate,
          invoiceUrl: c.invoiceUrl, boletoUrl: c.bankSlipUrl,
          description: c.description,
        })));
      }

      case 'charges.create': {
        const data = await asaasCall<AsaasChargeRaw>('/payments', {
          method: 'POST',
          body: JSON.stringify({
            customer: params.customer,
            billingType: params.billingType ?? 'PIX',
            value: params.value,
            dueDate: params.dueDate,
            description: params.description,
          }),
        });

        // Se for PIX, busca QR Code
        let pixQrCode: string | undefined;
        let pixCopyPaste: string | undefined;
        if (data.billingType === 'PIX') {
          try {
            const pix = await asaasCall<{ encodedImage: string; payload: string }>(`/payments/${data.id}/pixQrCode`);
            pixQrCode = pix.encodedImage;
            pixCopyPaste = pix.payload;
          } catch (e) {
            console.warn('Falha buscando PIX QR Code:', e);
          }
        }

        return ok({
          id: data.id, customerId: data.customer, customerName: '',
          value: data.value, netValue: data.netValue, billingType: data.billingType,
          status: data.status, dueDate: data.dueDate,
          invoiceUrl: data.invoiceUrl, boletoUrl: data.bankSlipUrl,
          description: data.description, pixQrCode, pixCopyPaste,
        });
      }

      // Público, read-only: alimenta a página de pagamento Thribus (/pay/:id).
      // Devolve só dados de exibição da cobrança + o pagador. Sem token, sem ações.
      case 'charges.get': {
        const id = String(params.id ?? '').trim();
        if (!id) return bad('missing charge id');

        const c = await asaasCall<AsaasChargeRaw>(`/payments/${id}`);

        // Linha digitável do boleto (quando houver)
        let boletoLine: string | undefined = c.identificationField;
        if (!boletoLine && c.billingType === 'BOLETO') {
          try {
            const idf = await asaasCall<{ identificationField: string }>(`/payments/${id}/identificationField`);
            boletoLine = idf.identificationField;
          } catch (_) { /* sem linha digitável — segue */ }
        }

        // QR Code PIX (qualquer cobrança PIX-elegível tem QR via Asaas)
        let pixQrCode: string | undefined;
        let pixCopyPaste: string | undefined;
        try {
          const pix = await asaasCall<{ encodedImage: string; payload: string; success?: boolean }>(`/payments/${id}/pixQrCode`);
          if (pix.payload) { pixQrCode = pix.encodedImage; pixCopyPaste = pix.payload; }
        } catch (_) { /* nem toda cobrança tem PIX — segue */ }

        // Pagador (nome/email) — dado do próprio comprador, seguro exibir
        let buyerName = '';
        let buyerEmail: string | undefined;
        try {
          const cust = await asaasCall<AsaasCustomerRaw>(`/customers/${c.customer}`);
          buyerName = cust.name;
          buyerEmail = cust.email;
        } catch (_) { /* segue sem dados do pagador */ }

        return ok({
          id: c.id,
          value: c.value,
          status: c.status,
          billingType: c.billingType,
          dueDate: c.dueDate,
          paymentDate: c.paymentDate,
          description: c.description,
          invoiceNumber: c.invoiceNumber,
          invoiceUrl: c.invoiceUrl,
          boletoUrl: c.bankSlipUrl,
          boletoLine,
          fine: c.fine?.value ?? 0,
          interest: c.interest?.value ?? 0,
          discount: c.discount?.value ?? 0,
          pixQrCode,
          pixCopyPaste,
          buyerName,
          buyerEmail,
        });
      }

      case 'charges.refund': {
        const data = await asaasCall<AsaasChargeRaw>(`/payments/${params.id}/refund`, {
          method: 'POST',
          body: JSON.stringify(params.value ? { value: params.value } : {}),
        });
        return ok(data);
      }

      case 'subscriptions.list': {
        const list = await asaasCall<AsaasListResp<AsaasSubscriptionRaw>>('/subscriptions?limit=50');
        return ok(list.data.map((s) => ({
          id: s.id, customerId: s.customer, customerName: '',
          value: s.value, cycle: s.cycle, nextDueDate: s.nextDueDate,
          billingType: s.billingType, status: s.status, description: s.description,
        })));
      }

      default:
        return new Response(JSON.stringify({ error: `unknown action: ${action}` }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    console.error('[asaas-proxy] error:', err);
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

function bad(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
