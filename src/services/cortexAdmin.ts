/**
 * Cortex Admin — service layer pra falar com /cortex/admin/* do worker.
 *
 * Configurar em .env.local:
 *   VITE_CORTEX_BASE_URL=https://worker.thribus.com.br
 *   VITE_CORTEX_ADMIN_SECRET=<mesmo valor de ADMIN_SECRET no worker>
 *
 * Em dev: aponta pra http://localhost:3200 e secret local.
 *
 * AVISO: VITE_CORTEX_ADMIN_SECRET fica acessível no browser. Use apenas em
 * painel interno protegido. Em produção, a recomendação é proxy server-side
 * que assina as requests (mas pra MVP/admin interno, isso resolve).
 */

const BASE_URL =
  (import.meta.env.VITE_CORTEX_BASE_URL as string | undefined) ??
  'http://localhost:3200';
const ADMIN_SECRET = import.meta.env.VITE_CORTEX_ADMIN_SECRET as string | undefined;

export const cortexAdminConfigured = !!ADMIN_SECRET;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CortexTenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'scale' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  workspace_id: string | null;
  monthly_message_limit: number | null;
  monthly_cost_limit_usd: number | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CortexApiKey {
  id: number;
  key_prefix: string;
  name: string;
  scopes: string[];
  status: 'active' | 'revoked';
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface CortexUsage {
  messages: number;
  costUsd: number;
}

export interface CortexAgent {
  id: string;
  name: string;
  category: string;
  description: string;
  intents: string[];
  version: string;
}

export interface AnalyzeResult {
  sessionId: string;
  reply: string | null;
  actions: Array<{
    type: string;
    agent?: string;
    tool?: string;
    payload?: Record<string, unknown>;
    riskLevel?: number;
  }>;
  insights: Array<{ kind: string; text: string; confidence?: number }>;
  metrics: {
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
    agentUsed?: string;
    model?: string;
  };
  traceId: string;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<
    string,
    {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
      buckets: Record<string, number>;
    }
  >;
  uptime_seconds: number;
  ts: string;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

class CortexError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function adminRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!ADMIN_SECRET) {
    throw new CortexError(
      0,
      'VITE_CORTEX_ADMIN_SECRET não configurado no .env.local',
    );
  }
  const resp = await fetch(`${BASE_URL}/cortex/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': ADMIN_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new CortexError(resp.status, data.error ?? resp.statusText, data);
  }
  return data as T;
}

async function publicRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  apiKey?: string,
): Promise<T> {
  const resp = await fetch(`${BASE_URL}/cortex${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new CortexError(resp.status, data.error ?? resp.statusText, data);
  }
  return data as T;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const cortexAdmin = {
  baseUrl: BASE_URL,

  async listTenants(): Promise<CortexTenant[]> {
    const data = await adminRequest<{ tenants: CortexTenant[] }>('GET', '/tenants');
    return data.tenants;
  },

  async getTenant(idOrSlug: string): Promise<CortexTenant> {
    const data = await adminRequest<{ tenant: CortexTenant }>(
      'GET',
      `/tenants/${idOrSlug}`,
    );
    return data.tenant;
  },

  async createTenant(input: {
    name: string;
    slug: string;
    plan?: string;
    workspace_id?: string;
    monthly_message_limit?: number;
    monthly_cost_limit_usd?: number;
  }): Promise<CortexTenant> {
    const data = await adminRequest<{ tenant: CortexTenant }>(
      'POST',
      '/tenants',
      input,
    );
    return data.tenant;
  },

  async updateTenant(
    id: string,
    patch: Partial<{
      name: string;
      plan: string;
      status: string;
      workspace_id: string | null;
      monthly_message_limit: number | null;
      monthly_cost_limit_usd: number | null;
      config: Record<string, unknown>;
    }>,
  ): Promise<CortexTenant> {
    const data = await adminRequest<{ tenant: CortexTenant }>(
      'PATCH',
      `/tenants/${id}`,
      patch,
    );
    return data.tenant;
  },

  async listApiKeys(tenantId: string): Promise<CortexApiKey[]> {
    const data = await adminRequest<{ keys: CortexApiKey[] }>(
      'GET',
      `/tenants/${tenantId}/api-keys`,
    );
    return data.keys;
  },

  async createApiKey(
    tenantId: string,
    input: { name: string; scopes?: string[]; env?: 'live' | 'test' },
  ): Promise<{ key: CortexApiKey; raw: string }> {
    const data = await adminRequest<{
      key: CortexApiKey;
      raw: string;
      warning: string;
    }>('POST', `/tenants/${tenantId}/api-keys`, input);
    return { key: data.key, raw: data.raw };
  },

  async revokeApiKey(keyId: number): Promise<CortexApiKey> {
    const data = await adminRequest<{ key: CortexApiKey }>(
      'POST',
      `/api-keys/${keyId}/revoke`,
    );
    return data.key;
  },

  async getUsage(tenantId: string): Promise<CortexUsage> {
    const data = await adminRequest<{ current_month: CortexUsage }>(
      'GET',
      `/tenants/${tenantId}/usage`,
    );
    return data.current_month;
  },

  async getMetrics(): Promise<MetricsSnapshot> {
    return adminRequest<MetricsSnapshot>('GET', '/metrics');
  },

  async addKnowledge(input: {
    tenant_id: string;
    title?: string;
    text: string;
    source?: string;
    tags?: string[];
    agent_scope?: string[];
  }): Promise<void> {
    await adminRequest('POST', '/knowledge', input);
  },

  // ─── Endpoints públicos (com API key do tenant) ─────────────────────────

  async listAgents(apiKey?: string): Promise<CortexAgent[]> {
    const data = await publicRequest<{ agents: CortexAgent[] }>(
      'GET',
      '/agents',
      undefined,
      apiKey,
    );
    return data.agents;
  },

  async analyze(
    apiKey: string,
    input: {
      sessionId: string;
      input: string;
      entity?: { type: string; id: string; displayName?: string; attrs?: Record<string, unknown> };
      channel?: string;
      hints?: { forceAgent?: string };
    },
  ): Promise<AnalyzeResult> {
    return publicRequest<AnalyzeResult>('POST', '/analyze', input, apiKey);
  },

  async health(): Promise<{
    service: string;
    status: string;
    agents: number;
    sessions: number;
    ts: string;
  }> {
    return publicRequest('GET', '/health');
  },
};

export { CortexError };
