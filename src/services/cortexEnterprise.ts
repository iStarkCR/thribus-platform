/**
 * Cortex Enterprise — service layer pra módulos, contratos, propostas,
 * billing e SSO.
 */

const BASE_URL =
  (import.meta.env.VITE_CORTEX_BASE_URL as string | undefined) ??
  'http://localhost:3200';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CortexModule {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: 'sales' | 'ops' | 'comms' | 'analytics' | 'finance';
  version: string;
  status: 'stable' | 'beta' | 'preview' | 'coming-soon';
  icon: string;
  tags: string[];
  has_runtime: boolean;
}

export interface Contract {
  id: string;
  number: string | null;
  title: string;
  party_name: string;
  party_document: string | null;
  party_email: string | null;
  body_md: string;
  total_value: number | null;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  status: 'draft' | 'sent' | 'signed' | 'active' | 'expired' | 'canceled';
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  number: string | null;
  title: string;
  client_name: string;
  client_email: string | null;
  summary: string;
  body_md: string;
  items: Array<{ description: string; qty: number; unit_price: number; subtotal: number }>;
  total_value: number;
  currency: string;
  valid_until: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: number;
  tenant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_code: string;
  billing_cycle: 'monthly' | 'yearly';
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  display_name?: string;
}

class CortexError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function bearerRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  apiKey: string | undefined,
  body?: unknown,
): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new CortexError(resp.status, (data as { error?: string }).error ?? resp.statusText);
  }
  return data as T;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const cortexEnterprise = {
  // Catálogo público
  async listModules(): Promise<CortexModule[]> {
    const data = await bearerRequest<{ modules: CortexModule[] }>(
      'GET',
      '/cortex/modules',
      undefined,
    );
    return data.modules;
  },

  // Auth (JWT)
  async signin(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    return bearerRequest('POST', '/cortex/auth/signin', undefined, { email, password });
  },

  async signup(input: {
    email: string;
    password: string;
    display_name?: string;
    tenant_slug?: string;
  }): Promise<{ user: AuthUser; token: string }> {
    return bearerRequest('POST', '/cortex/auth/signup', undefined, input);
  },

  async me(jwt: string): Promise<{ user: AuthUser; tenants: Array<{ id: string; name: string; slug: string; plan: string; role: string }> }> {
    return bearerRequest('GET', '/cortex/auth/me', jwt);
  },

  // Contratos (auth: API key Bearer)
  async listContracts(apiKey: string, status?: string): Promise<Contract[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await bearerRequest<{ contracts: Contract[] }>(
      'GET',
      `/cortex/modules/contracts${q}`,
      apiKey,
    );
    return data.contracts;
  },

  async createContract(apiKey: string, input: Partial<Contract>): Promise<Contract> {
    const data = await bearerRequest<{ contract: Contract }>(
      'POST',
      '/cortex/modules/contracts',
      apiKey,
      input,
    );
    return data.contract;
  },

  async updateContract(
    apiKey: string,
    id: string,
    patch: Partial<Contract>,
  ): Promise<Contract> {
    const data = await bearerRequest<{ contract: Contract }>(
      'PATCH',
      `/cortex/modules/contracts/${id}`,
      apiKey,
      patch,
    );
    return data.contract;
  },

  async signContract(apiKey: string, id: string): Promise<Contract> {
    const data = await bearerRequest<{ contract: Contract }>(
      'POST',
      `/cortex/modules/contracts/${id}/sign`,
      apiKey,
    );
    return data.contract;
  },

  async deleteContract(apiKey: string, id: string): Promise<void> {
    await bearerRequest('DELETE', `/cortex/modules/contracts/${id}`, apiKey);
  },

  // Propostas
  async listProposals(apiKey: string, status?: string): Promise<Proposal[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await bearerRequest<{ proposals: Proposal[] }>(
      'GET',
      `/cortex/modules/proposals${q}`,
      apiKey,
    );
    return data.proposals;
  },

  async createProposal(apiKey: string, input: Partial<Proposal>): Promise<Proposal> {
    const data = await bearerRequest<{ proposal: Proposal }>(
      'POST',
      '/cortex/modules/proposals',
      apiKey,
      input,
    );
    return data.proposal;
  },

  async updateProposalStatus(
    apiKey: string,
    id: string,
    action: 'send' | 'mark-viewed' | 'accept' | 'reject',
  ): Promise<Proposal> {
    const data = await bearerRequest<{ proposal: Proposal }>(
      'POST',
      `/cortex/modules/proposals/${id}/${action}`,
      apiKey,
    );
    return data.proposal;
  },

  async deleteProposal(apiKey: string, id: string): Promise<void> {
    await bearerRequest('DELETE', `/cortex/modules/proposals/${id}`, apiKey);
  },

  // Billing
  async startCheckout(
    jwt: string,
    input: {
      tenant_id: string;
      plan: 'essencial' | 'business' | 'corporate';
      cycle: 'monthly' | 'yearly';
      success_url?: string;
      cancel_url?: string;
    },
  ): Promise<{ url: string; session_id: string }> {
    return bearerRequest('POST', '/cortex/billing/checkout', jwt, input);
  },

  async openPortal(jwt: string, tenantId: string): Promise<{ url: string }> {
    return bearerRequest('POST', '/cortex/billing/portal', jwt, { tenant_id: tenantId });
  },

  async getSubscription(jwt: string, tenantId: string): Promise<Subscription | null> {
    const data = await bearerRequest<{ subscription: Subscription | null }>(
      'GET',
      `/cortex/billing/subscription/${tenantId}`,
      jwt,
    );
    return data.subscription;
  },
};

export { CortexError };
