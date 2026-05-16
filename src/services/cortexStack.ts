/**
 * Cortex Stack — service consolidado pra M1+M2+M3.
 * Reusa BASE_URL do cortexAdmin.
 */

const BASE_URL =
  (import.meta.env.VITE_CORTEX_BASE_URL as string | undefined) ??
  'http://localhost:3200';
const ADMIN_SECRET = import.meta.env.VITE_CORTEX_ADMIN_SECRET as string | undefined;

interface FetchOpts {
  apiKey?: string;
  admin?: boolean;
  body?: unknown;
}

async function req<T>(method: string, path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  if (opts.admin && ADMIN_SECRET) headers['X-Admin-Secret'] = ADMIN_SECRET;
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as { error?: string }).error ?? resp.statusText);
  return data as T;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentTemplate {
  id?: string;
  slug: string;
  name: string;
  category: string;
  vertical: string;
  description: string;
  intents: string[];
  icon: string;
  install_count?: number;
  preview_messages?: Array<{ role: string; content: string }>;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  steps: Array<{ id: string; type: string; config: Record<string, unknown> }>;
  enabled: boolean;
  created_at: string;
}

export interface OutgoingWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  created_at: string;
}

export interface Approval {
  id: string;
  source: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  risk_level: number;
  context: string;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  source: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expected_close: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  customer_name: string | null;
  customer_email: string | null;
  category: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_name: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  payment_method: string | null;
  created_at: string;
}

export interface KbDoc {
  id: string;
  title: string;
  folder_id: string | null;
  tags: string[];
  version: number;
  visibility: string;
  view_count: number;
  last_edited_at: string;
}

export interface AuditEntry {
  id: number;
  tenant_id: string;
  trace_id: string;
  session_id: string;
  selected_agent: string | null;
  intent: string | null;
  status: string;
  latency_ms: number;
  estimated_cost_usd: number;
  input_text: string;
  created_at: string;
}

export interface Integration {
  id: string;
  provider: string;
  display_name: string;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  sync_direction: string;
}

export interface WhiteLabel {
  brand_name?: string;
  logo_url?: string;
  primary_color?: string;
  favicon_url?: string;
  support_email?: string;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const cortexStack = {
  // M1 — Templates
  listTemplates: () => req<{ templates: AgentTemplate[] }>('GET', '/cortex/m1/templates'),
  seedTemplates: () => req<{ inserted: number; updated: number }>('POST', '/cortex/m1/templates/seed', { admin: true }),
  installTemplate: (slug: string, body: { tenant_id: string; agent_id: string; display_name?: string }) =>
    req('POST', `/cortex/m1/templates/${slug}/install`, { admin: true, body }),

  // M1 — Workflows
  listWorkflows: (tenantId: string) =>
    req<{ workflows: Workflow[] }>('GET', `/cortex/m1/workflows?tenant_id=${encodeURIComponent(tenantId)}`, { admin: true }),
  createWorkflow: (body: Partial<Workflow>) =>
    req<{ workflow: Workflow }>('POST', '/cortex/m1/workflows', { admin: true, body }),
  runWorkflow: (id: string, payload: Record<string, unknown>) =>
    req<{ runId: number; status: string }>('POST', `/cortex/m1/workflows/${id}/run`, { admin: true, body: payload }),

  // M1 — Webhooks
  listWebhooks: (tenantId: string) =>
    req<{ webhooks: OutgoingWebhook[] }>('GET', `/cortex/m1/webhooks/${tenantId}`, { admin: true }),
  createWebhook: (body: { tenant_id: string; name: string; url: string; events?: string[] }) =>
    req<{ webhook: OutgoingWebhook; secret: string }>('POST', '/cortex/m1/webhooks', { admin: true, body }),
  revokeWebhook: (id: string) =>
    req('POST', `/cortex/m1/webhooks/${id}/revoke`, { admin: true }),

  // M1 — Approvals
  listPendingApprovals: (tenantId: string) =>
    req<{ approvals: Approval[] }>('GET', `/cortex/m1/approvals/pending/${tenantId}`, { admin: true }),
  decideApproval: (jwt: string, id: string, decision: 'approved' | 'rejected', reason?: string) =>
    req('POST', `/cortex/m1/approvals/${id}/decide`, { apiKey: jwt, body: { decision, reason } }),

  // M1 — Notifications (in-app)
  listNotifications: (jwt: string) =>
    req<{ notifications: Array<{ id: number; title: string; body: string; priority: string; read_at: string | null; created_at: string }> }>(
      'GET', '/cortex/m1/notifications', { apiKey: jwt }),
  markNotificationRead: (jwt: string, id: number) =>
    req('POST', `/cortex/m1/notifications/${id}/read`, { apiKey: jwt }),

  // M2 — CRM
  listLeads: (apiKey: string) => req<{ leads: Lead[] }>('GET', '/cortex/modules/crm/leads', { apiKey }),
  createLead: (apiKey: string, body: Partial<Lead>) =>
    req<{ lead: Lead }>('POST', '/cortex/modules/crm/leads', { apiKey, body }),
  listDeals: (apiKey: string) => req<{ deals: Deal[] }>('GET', '/cortex/modules/crm/deals', { apiKey }),
  createDeal: (apiKey: string, body: Partial<Deal> & { title: string }) =>
    req<{ deal: Deal }>('POST', '/cortex/modules/crm/deals', { apiKey, body }),
  updateDealStage: (apiKey: string, id: string, stage: string) =>
    req<{ deal: Deal }>('PATCH', `/cortex/modules/crm/deals/${id}`, { apiKey, body: { stage } }),
  forecast: (apiKey: string) =>
    req<{ by_stage: Record<string, { count: number; total: number; weighted: number }>; total: number; total_weighted: number }>(
      'GET', '/cortex/modules/crm/forecast', { apiKey }),

  // M2 — Tickets
  listTickets: (apiKey: string, params?: { status?: string; priority?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.priority) q.set('priority', params.priority);
    const qs = q.toString();
    return req<{ tickets: Ticket[] }>('GET', `/cortex/modules/tickets${qs ? '?' + qs : ''}`, { apiKey });
  },
  createTicket: (apiKey: string, body: Partial<Ticket> & { subject: string }) =>
    req<{ ticket: Ticket }>('POST', '/cortex/modules/tickets', { apiKey, body }),

  // M2 — Billing BR
  listInvoices: (apiKey: string) => req<{ invoices: Invoice[] }>('GET', '/cortex/modules/billing-br/invoices', { apiKey }),
  createInvoice: (apiKey: string, body: Partial<Invoice> & { customer_name: string; description: string; amount: number; due_date: string }) =>
    req<{ invoice: Invoice }>('POST', '/cortex/modules/billing-br/invoices', { apiKey, body }),
  billingMetrics: (apiKey: string) =>
    req<{ to_receive: number; overdue: number; currency: string }>('GET', '/cortex/modules/billing-br/metrics', { apiKey }),

  // M2 — KB
  listKbDocs: (apiKey: string) => req<{ docs: KbDoc[] }>('GET', '/cortex/modules/kb/docs', { apiKey }),
  createKbDoc: (apiKey: string, body: { title: string; body_md?: string; tags?: string[]; folder_id?: string }) =>
    req<{ doc: KbDoc }>('POST', '/cortex/modules/kb/docs', { apiKey, body }),
  searchKb: (apiKey: string, q: string) =>
    req<{ hits: Array<{ title: string; text: string; similarity: number }> }>('GET', `/cortex/modules/kb/search?q=${encodeURIComponent(q)}`, { apiKey }),

  // M3 — Audit
  searchAudit: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return req<{ entries: AuditEntry[] }>('GET', `/cortex/m3/audit?${q}`, { admin: true });
  },
  auditExportUrl: (tenantId: string) =>
    `${BASE_URL}/cortex/m3/audit/export?tenant_id=${encodeURIComponent(tenantId)}`,

  // M3 — Integrations
  listIntegrations: (tenantId: string) =>
    req<{ integrations: Integration[] }>('GET', `/cortex/m3/integrations/${tenantId}`, { admin: true }),
  createIntegration: (body: { tenant_id: string; provider: string; display_name?: string }) =>
    req<{ integration: Integration }>('POST', '/cortex/m3/integrations', { admin: true, body }),
  syncIntegration: (id: string) =>
    req('POST', `/cortex/m3/integrations/${id}/sync`, { admin: true }),

  // M3 — White-label
  getWhiteLabel: (tenantId: string) =>
    req<{ tenant: { id: string; name: string; slug: string; white_label: WhiteLabel; custom_domain: string | null } }>(
      'GET', `/cortex/m3/white-label/${tenantId}`, { admin: true }),
  updateWhiteLabel: (tenantId: string, body: { white_label?: WhiteLabel; custom_domain?: string }) =>
    req('PATCH', `/cortex/m3/white-label/${tenantId}`, { admin: true, body }),

  baseUrl: BASE_URL,
  hasAdmin: !!ADMIN_SECRET,
};
