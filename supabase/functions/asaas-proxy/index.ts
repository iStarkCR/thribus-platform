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
interface AsaasChargeRaw {
  id: string; customer: string; value: number; netValue: number;
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  status: string; dueDate: string; paymentDate?: string;
  invoiceUrl?: string; bankSlipUrl?: string; description: string;
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
