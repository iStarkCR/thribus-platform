/**
 * Edge Function: ixc-proxy
 *
 * Proxy seguro pra IXC API (ERP de ISP). Token + hash NUNCA no browser.
 * IXC usa autenticação custom (token:hash em Authorization Basic) + listagem
 * paginada via header "ixcsoft: listar".
 *
 * Setup:
 *   supabase secrets set IXC_URL=https://provedor.ixc.com.br/webservice/v1
 *   supabase secrets set IXC_TOKEN=8
 *   supabase secrets set IXC_HASH=abc123...
 *   supabase functions deploy ixc-proxy
 *
 * Actions:
 *   cliente.list (por nome, doc, telefone)
 *   cliente.get (por id)
 *   contrato.list (por cliente)
 *   fatura.list (por cliente, em aberto)
 *   os.list (ordem de serviço aberta)
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';

// @ts-expect-error
const IXC_URL = Deno.env.get('IXC_URL')!;
// @ts-expect-error
const IXC_TOKEN = Deno.env.get('IXC_TOKEN')!;
// @ts-expect-error
const IXC_HASH = Deno.env.get('IXC_HASH')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AUTH = `Basic ${btoa(`${IXC_TOKEN}:${IXC_HASH}`)}`;

interface IxcListResp<T> { registros: T[]; total: number }

async function ixcList<T>(resource: string, filters: Record<string, unknown> = {}): Promise<T[]> {
  const body = {
    qtype: filters.qtype ?? `${resource}.id`,
    query: filters.query ?? '',
    oper: filters.oper ?? '>',
    page: filters.page ?? 1,
    rp: filters.rp ?? 50,
    sortname: filters.sortname ?? `${resource}.id`,
    sortorder: filters.sortorder ?? 'desc',
    grid_param: filters.grid_param ? JSON.stringify(filters.grid_param) : undefined,
  };

  const res = await fetch(`${IXC_URL}/${resource}`, {
    method: 'POST',
    headers: {
      Authorization: AUTH,
      ixcsoft: 'listar',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`IXC ${res.status}: ${await res.text()}`);
  const data = await res.json() as IxcListResp<T>;
  return data.registros ?? [];
}

async function ixcGet<T>(resource: string, id: string | number): Promise<T> {
  const res = await fetch(`${IXC_URL}/${resource}/${id}`, {
    method: 'GET',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`IXC ${res.status}: ${await res.text()}`);
  return res.json();
}

interface IxcCliente {
  id: string; razao: string; cnpj_cpf: string; telefone_celular?: string; telefone?: string;
  email?: string; cidade?: string; uf?: string; ativo: 'S' | 'N';
}
interface IxcContrato {
  id: string; id_cliente: string; descricao_complementar?: string; status: string;
  data_ativacao?: string; mensalidade?: string; id_vd_contrato?: string;
}
interface IxcFatura {
  id: string; id_cliente: string; valor: string; data_vencimento: string; status: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { action, params = {} } = await req.json();

    switch (action) {
      case 'cliente.list': {
        // Busca por nome, telefone, ou CPF/CNPJ
        const filters: Record<string, unknown> = {};
        if (params.phone) {
          filters.qtype = 'cliente.telefone_celular'; filters.query = params.phone; filters.oper = '=';
        } else if (params.document) {
          filters.qtype = 'cliente.cnpj_cpf'; filters.query = params.document.replace(/\D/g, ''); filters.oper = '=';
        } else if (params.name) {
          filters.qtype = 'cliente.razao'; filters.query = params.name; filters.oper = 'L';
        }
        const data = await ixcList<IxcCliente>('cliente', filters);
        return ok(data.map(maskCliente));
      }

      case 'cliente.get': {
        const data = await ixcGet<IxcCliente>('cliente', params.id);
        return ok(maskCliente(data));
      }

      case 'contrato.list': {
        const filters = { qtype: 'cliente_contrato.id_cliente', query: params.cliente_id, oper: '=', rp: 20 };
        const data = await ixcList<IxcContrato>('cliente_contrato', filters);
        return ok(data);
      }

      case 'fatura.list': {
        const filters: Record<string, unknown> = { qtype: 'fn_areceber.id_cliente', query: params.cliente_id, oper: '=', rp: 20 };
        if (params.status_filter === 'aberta') {
          filters.grid_param = [{ TB: 'fn_areceber.status', OP: '=', P: 'A' }];
        }
        const data = await ixcList<IxcFatura>('fn_areceber', filters);
        return ok(data);
      }

      case 'os.list': {
        const filters = { qtype: 'su_oss_chamado.id_cliente', query: params.cliente_id, oper: '=', rp: 20 };
        const data = await ixcList<Record<string, unknown>>('su_oss_chamado', filters);
        return ok(data);
      }

      default:
        return new Response(JSON.stringify({ error: `unknown action: ${action}` }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    console.error('[ixc-proxy] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// Mascarar CPF/CNPJ antes de devolver (LGPD friendly)
function maskCliente(c: IxcCliente) {
  const doc = c.cnpj_cpf ?? '';
  const masked = doc.length === 11
    ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
    : doc.length === 14
      ? `${doc.slice(0, 2)}.***.${doc.slice(5, 8)}/${doc.slice(8, 12)}-**`
      : doc;
  return {
    id: c.id, name: c.razao, document: masked,
    phone: c.telefone_celular ?? c.telefone, email: c.email,
    city: c.cidade, state: c.uf, active: c.ativo === 'S',
  };
}

function ok<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
