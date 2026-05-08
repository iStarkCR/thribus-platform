/**
 * Thribus Agents — API Service Layer
 *
 * Cada método tem dois caminhos:
 *  1. Supabase configurado → query real
 *  2. Sem Supabase → fallback em memória (SEED_*) para dev sem backend
 *
 * Quando você definir VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env,
 * todas as operações passam a persistir no banco automaticamente.
 */

import type {
  Agent,
  CreateAgentPayload,
  CreateWorkspacePayload,
  DashboardMetrics,
  Escalation,
  Execution,
  TestAgentPayload,
  TestAgentResponse,
  Tool,
  Workspace,
} from '@/types';
import { SEED_AGENTS, SEED_ESCALATIONS, SEED_EXECUTIONS, SEED_TOOLS } from '@/lib/seed-data';
import { supabase } from '@/lib/supabase';

// ─── Mappers (snake_case → camelCase) ─────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  client: string;
  sector: string;
  type: Agent['type'];
  status: Agent['status'];
  model: Agent['model'];
  system_prompt: string;
  tools: string[];
  channel: string | null;
  stats_today: number;
  stats_resolution: number;
  stats_avg_response_time: number;
  stats_escalated: number;
  created_at: string;
  updated_at: string;
}

// Para o INSERT/UPDATE — channel pode ser null para "limpar"
type AgentRowUpdate = Partial<Omit<AgentRow, 'channel'>> & { channel?: string | null };

function rowToAgent(r: AgentRow & { workspace_id?: string | null }): Agent {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    sector: r.sector,
    type: r.type,
    status: r.status,
    model: r.model,
    systemPrompt: r.system_prompt,
    tools: r.tools ?? [],
    channel: r.channel ?? undefined,
    workspaceId: r.workspace_id ?? undefined,
    stats: {
      today: r.stats_today,
      resolution: r.stats_resolution,
      avgResponseTime: Number(r.stats_avg_response_time),
      escalated: r.stats_escalated,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface WorkspaceRow {
  id: string;
  name: string;
  llm_provider: 'openai' | 'anthropic';
  llm_api_key: string | null;
  crm_provider: 'talki' | 'texnet' | null;
  crm_base_url: string | null;
  crm_account_id: string | null;
  crm_api_token: string | null;
  texnet_bot_sender_id: string | null;
  talki_required_label: string | null;
  credentials: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

function rowToWorkspace(r: WorkspaceRow): Workspace {
  return {
    id: r.id,
    name: r.name,
    llmProvider: r.llm_provider,
    llmApiKey: r.llm_api_key ?? undefined,
    crmProvider: r.crm_provider ?? undefined,
    crmBaseUrl: r.crm_base_url ?? undefined,
    crmAccountId: r.crm_account_id ?? undefined,
    crmApiToken: r.crm_api_token ?? undefined,
    texnetBotSenderId: r.texnet_bot_sender_id ?? undefined,
    talkiRequiredLabel: r.talki_required_label ?? undefined,
    credentials: r.credentials && typeof r.credentials === 'object' ? r.credentials : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface ToolRow {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: Tool['method'];
  scope: string;
  active: boolean;
  auth_type: Tool['authType'] | null;
  auth_credentials: ToolAuthCredentialsDb | null;
  extra_headers: Record<string, string> | null;
}

// Schema do jsonb auth_credentials no DB (snake_case).
interface ToolAuthCredentialsDb {
  username_ref?: string;
  password_ref?: string;
  token_ref?: string;
  header_name?: string;
  value_ref?: string;
}

function authCredsDbToApp(db: ToolAuthCredentialsDb | null): Tool['authCredentials'] {
  if (!db || typeof db !== 'object') return undefined;
  return {
    usernameRef: db.username_ref,
    passwordRef: db.password_ref,
    tokenRef: db.token_ref,
    headerName: db.header_name,
    valueRef: db.value_ref,
  };
}

function authCredsAppToDb(app: Tool['authCredentials']): ToolAuthCredentialsDb | null {
  if (!app) return null;
  const out: ToolAuthCredentialsDb = {};
  if (app.usernameRef) out.username_ref = app.usernameRef;
  if (app.passwordRef) out.password_ref = app.passwordRef;
  if (app.tokenRef) out.token_ref = app.tokenRef;
  if (app.headerName) out.header_name = app.headerName;
  if (app.valueRef) out.value_ref = app.valueRef;
  return Object.keys(out).length === 0 ? null : out;
}

function rowToTool(r: ToolRow): Tool {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    endpoint: r.endpoint,
    method: r.method,
    scope: r.scope,
    active: r.active,
    authType: r.auth_type ?? undefined,
    authCredentials: authCredsDbToApp(r.auth_credentials),
    extraHeaders:
      r.extra_headers && typeof r.extra_headers === 'object' ? r.extra_headers : undefined,
  };
}

interface ExecutionRow {
  id: string;
  agent_id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  status: Execution['status'];
  tools_used: string[];
  response_time_ms: number;
  total_tokens: number;
  cache_read_tokens: number | null;
  cost_usd: number;
  created_at: string;
  agents?: { name: string; client: string; model: string };
}

function rowToExecution(r: ExecutionRow): Execution {
  return {
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agents?.name ?? 'Desconhecido',
    clientName: r.agents?.client ?? '—',
    customerName: r.customer_name ?? r.customer_phone,
    status: r.status,
    toolsUsed: r.tools_used ?? [],
    responseTime: Math.round(r.response_time_ms / 100) / 10,
    tokensUsed: r.total_tokens,
    cacheReadTokens: r.cache_read_tokens ?? 0,
    model: r.agents?.model,
    cost: Number(r.cost_usd),
    timestamp: r.created_at,
    conversationId: r.conversation_id,
  };
}

interface EscalationRow {
  id: string;
  agent_id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  reason: string;
  priority: Escalation['priority'];
  created_at: string;
  agents?: { name: string };
}

function rowToEscalation(r: EscalationRow): Escalation {
  const min = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
  return {
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agents?.name ?? 'Desconhecido',
    customerName: r.customer_name ?? r.customer_phone,
    reason: r.reason,
    waitTime: Math.max(0, min),
    priority: r.priority,
    conversationId: r.conversation_id,
    timestamp: r.created_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula stats em runtime a partir da tabela `executions`.
 * Os campos stats_* na tabela `agents` ficam estáticos (legacy).
 * Esta função sobrescreve com dados reais por agente:
 *   - today: # de execuções hoje
 *   - resolution: % de status='resolved' (vs total)
 *   - avgResponseTime: avg response_time_ms / 1000 (segundos)
 *   - escalated: # de status='escalated' (todas, não só hoje)
 */
async function computeStatsFromExecutions(
  agentIds: string[],
): Promise<Record<string, Agent['stats']>> {
  const result: Record<string, Agent['stats']> = {};
  for (const id of agentIds) {
    result[id] = { today: 0, resolution: 0, avgResponseTime: 0, escalated: 0 };
  }
  if (!supabase || agentIds.length === 0) return result;

  // Hoje (UTC) — meia-noite local pode variar, usamos início do dia UTC
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startISO = startOfToday.toISOString();

  const { data, error } = await supabase
    .from('executions')
    .select('agent_id, status, response_time_ms, created_at')
    .in('agent_id', agentIds);
  if (error) {
    console.warn('[stats] erro buscando executions:', error.message);
    return result;
  }

  type Row = { agent_id: string; status: string; response_time_ms: number | null; created_at: string };
  const grouped: Record<
    string,
    { todayCount: number; resolved: number; total: number; escalated: number; sumMs: number; countWithMs: number }
  > = {};
  for (const r of (data as Row[]) ?? []) {
    if (!grouped[r.agent_id]) {
      grouped[r.agent_id] = {
        todayCount: 0,
        resolved: 0,
        total: 0,
        escalated: 0,
        sumMs: 0,
        countWithMs: 0,
      };
    }
    const g = grouped[r.agent_id];
    g.total++;
    if (r.status === 'resolved') g.resolved++;
    if (r.status === 'escalated') g.escalated++;
    if (r.created_at >= startISO) g.todayCount++;
    if (typeof r.response_time_ms === 'number' && r.response_time_ms > 0) {
      g.sumMs += r.response_time_ms;
      g.countWithMs++;
    }
  }

  for (const id of agentIds) {
    const g = grouped[id];
    if (!g) continue;
    result[id] = {
      today: g.todayCount,
      resolution: g.total > 0 ? Math.round((g.resolved / g.total) * 100) : 0,
      avgResponseTime: g.countWithMs > 0 ? Math.round(g.sumMs / g.countWithMs / 1000) : 0,
      escalated: g.escalated,
    };
  }
  return result;
}

export const agentsApi = {
  async list(): Promise<Agent[]> {
    if (!supabase) return SEED_AGENTS;
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const agents = (data as AgentRow[]).map(rowToAgent);
    // Sobrescreve stats com dados calculados em runtime
    const stats = await computeStatsFromExecutions(agents.map((a) => a.id));
    return agents.map((a) => ({ ...a, stats: stats[a.id] ?? a.stats }));
  },

  async get(id: string): Promise<Agent> {
    if (!supabase) {
      const a = SEED_AGENTS.find((x) => x.id === id);
      if (!a) throw new Error('Agent not found');
      return a;
    }
    const { data, error } = await supabase.from('agents').select('*').eq('id', id).single();
    if (error) throw error;
    const agent = rowToAgent(data as AgentRow);
    const stats = await computeStatsFromExecutions([id]);
    return { ...agent, stats: stats[id] ?? agent.stats };
  },

  async create(payload: CreateAgentPayload): Promise<Agent> {
    if (!supabase) {
      const newAgent: Agent = {
        id: `agent-${Date.now()}`,
        ...payload,
        status: 'standby',
        stats: { today: 0, resolution: 0, avgResponseTime: 0, escalated: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      SEED_AGENTS.push(newAgent);
      return newAgent;
    }
    const insertPayload: Record<string, unknown> = {
      name: payload.name,
      client: payload.client,
      sector: payload.sector,
      type: payload.type,
      model: payload.model,
      system_prompt: payload.systemPrompt,
      tools: payload.tools,
      channel: payload.channel ?? null,
      status: 'standby',
    };
    if (payload.workspaceId) insertPayload.workspace_id = payload.workspaceId;

    const { data, error } = await supabase
      .from('agents')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return rowToAgent(data as AgentRow);
  },

  async update(id: string, payload: Partial<Agent>): Promise<Agent> {
    if (!supabase) {
      const idx = SEED_AGENTS.findIndex((a) => a.id === id);
      if (idx === -1) throw new Error('Agent not found');
      SEED_AGENTS[idx] = { ...SEED_AGENTS[idx], ...payload, updatedAt: new Date().toISOString() };
      return SEED_AGENTS[idx];
    }
    const update: AgentRowUpdate = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.client !== undefined) update.client = payload.client;
    if (payload.sector !== undefined) update.sector = payload.sector;
    if (payload.type !== undefined) update.type = payload.type;
    if (payload.status !== undefined) update.status = payload.status;
    if (payload.model !== undefined) update.model = payload.model;
    if (payload.systemPrompt !== undefined) update.system_prompt = payload.systemPrompt;
    if (payload.tools !== undefined) update.tools = payload.tools;
    if (payload.channel !== undefined) update.channel = payload.channel || null;
    if (payload.workspaceId !== undefined) {
      (update as Record<string, unknown>).workspace_id = payload.workspaceId || null;
    }

    const { data, error } = await supabase
      .from('agents')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToAgent(data as AgentRow);
  },

  async toggleStatus(id: string): Promise<Agent> {
    const agent = await this.get(id);
    return this.update(id, { status: agent.status === 'online' ? 'standby' : 'online' });
  },

  async delete(id: string): Promise<void> {
    if (!supabase) {
      const idx = SEED_AGENTS.findIndex((a) => a.id === id);
      if (idx !== -1) SEED_AGENTS.splice(idx, 1);
      return;
    }
    const { error } = await supabase.from('agents').delete().eq('id', id);
    if (error) throw error;
  },

  async test(_payload: TestAgentPayload): Promise<TestAgentResponse> {
    // Teste real precisa do worker rodando — por ora, simulação
    await new Promise((r) => setTimeout(r, 1500));
    return {
      response:
        'Olá! O teste real precisa que o worker esteja rodando e configurado com TEXNET_API_KEY. Configure VITE_WORKER_URL no .env para rotear.',
      toolsUsed: [],
      tokensUsed: 0,
      responseTime: 0,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════════════

export type CreateToolPayload = Omit<Tool, 'id'>;

export const toolsApi = {
  async list(): Promise<Tool[]> {
    if (!supabase) return SEED_TOOLS;
    const { data, error } = await supabase
      .from('tools')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as ToolRow[]).map(rowToTool);
  },

  async create(payload: CreateToolPayload): Promise<Tool> {
    if (!supabase) {
      const newTool: Tool = { id: `tool-${Date.now()}`, ...payload };
      SEED_TOOLS.push(newTool);
      return newTool;
    }
    const { data, error } = await supabase
      .from('tools')
      .insert({
        name: payload.name,
        description: payload.description,
        endpoint: payload.endpoint,
        method: payload.method,
        scope: payload.scope,
        active: payload.active,
        auth_type: payload.authType ?? null,
        auth_credentials: authCredsAppToDb(payload.authCredentials),
        extra_headers:
          payload.extraHeaders && Object.keys(payload.extraHeaders).length > 0
            ? payload.extraHeaders
            : null,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToTool(data as ToolRow);
  },

  async update(id: string, payload: Partial<Tool>): Promise<Tool> {
    if (!supabase) {
      const idx = SEED_TOOLS.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error('Tool not found');
      SEED_TOOLS[idx] = { ...SEED_TOOLS[idx], ...payload };
      return SEED_TOOLS[idx];
    }
    const update: Partial<ToolRow> = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.endpoint !== undefined) update.endpoint = payload.endpoint;
    if (payload.method !== undefined) update.method = payload.method;
    if (payload.scope !== undefined) update.scope = payload.scope;
    if (payload.active !== undefined) update.active = payload.active;
    if (payload.authType !== undefined) update.auth_type = payload.authType ?? null;
    if (payload.authCredentials !== undefined) {
      update.auth_credentials = authCredsAppToDb(payload.authCredentials);
    }
    if (payload.extraHeaders !== undefined) {
      update.extra_headers =
        payload.extraHeaders && Object.keys(payload.extraHeaders).length > 0
          ? payload.extraHeaders
          : null;
    }

    const { data, error } = await supabase
      .from('tools')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToTool(data as ToolRow);
  },

  async toggleActive(id: string): Promise<Tool> {
    if (!supabase) {
      const tool = SEED_TOOLS.find((t) => t.id === id);
      if (!tool) throw new Error('Tool not found');
      return this.update(id, { active: !tool.active });
    }
    const { data: current } = await supabase
      .from('tools')
      .select('active')
      .eq('id', id)
      .single();
    return this.update(id, { active: !(current as { active: boolean }).active });
  },

  async delete(id: string): Promise<void> {
    if (!supabase) {
      const idx = SEED_TOOLS.findIndex((t) => t.id === id);
      if (idx !== -1) SEED_TOOLS.splice(idx, 1);
      return;
    }
    const { error } = await supabase.from('tools').delete().eq('id', id);
    if (error) throw error;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const executionsApi = {
  async list(limit = 50): Promise<Execution[]> {
    if (!supabase) return SEED_EXECUTIONS.slice(0, limit);
    const { data, error } = await supabase
      .from('executions')
      .select('*, agents(name, client, model)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as ExecutionRow[]).map(rowToExecution);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ESCALATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const escalationsApi = {
  async listPending(): Promise<Escalation[]> {
    if (!supabase) return SEED_ESCALATIONS;
    const { data, error } = await supabase
      .from('escalations')
      .select('*, agents(name)')
      .is('resolved_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as EscalationRow[]).map(rowToEscalation);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACES (multi-tenant)
// ═══════════════════════════════════════════════════════════════════════════

export const workspacesApi = {
  async list(): Promise<Workspace[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WorkspaceRow[]).map(rowToWorkspace);
  },

  async get(id: string): Promise<Workspace> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return rowToWorkspace(data as WorkspaceRow);
  },

  async create(payload: CreateWorkspacePayload): Promise<Workspace> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: payload.name,
        llm_provider: payload.llmProvider,
        llm_api_key: payload.llmApiKey ?? null,
        crm_provider: payload.crmProvider ?? null,
        crm_base_url: payload.crmBaseUrl ?? null,
        crm_account_id: payload.crmAccountId ?? null,
        crm_api_token: payload.crmApiToken ?? null,
        texnet_bot_sender_id: payload.texnetBotSenderId ?? null,
        talki_required_label: payload.talkiRequiredLabel ?? null,
        credentials: payload.credentials ?? {},
      })
      .select()
      .single();
    if (error) throw error;
    return rowToWorkspace(data as WorkspaceRow);
  },

  async update(id: string, payload: Partial<Workspace>): Promise<Workspace> {
    if (!supabase) throw new Error('Supabase não configurado');
    const update: Partial<WorkspaceRow> = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.llmProvider !== undefined) update.llm_provider = payload.llmProvider;
    if (payload.llmApiKey !== undefined) update.llm_api_key = payload.llmApiKey || null;
    if (payload.crmProvider !== undefined) update.crm_provider = payload.crmProvider || null;
    if (payload.crmBaseUrl !== undefined) update.crm_base_url = payload.crmBaseUrl || null;
    if (payload.crmAccountId !== undefined) update.crm_account_id = payload.crmAccountId || null;
    if (payload.crmApiToken !== undefined) update.crm_api_token = payload.crmApiToken || null;
    if (payload.texnetBotSenderId !== undefined) update.texnet_bot_sender_id = payload.texnetBotSenderId || null;
    if (payload.talkiRequiredLabel !== undefined) update.talki_required_label = payload.talkiRequiredLabel || null;
    if (payload.credentials !== undefined) update.credentials = payload.credentials ?? {};

    const { data, error } = await supabase
      .from('workspaces')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToWorkspace(data as WorkspaceRow);
  },

  async delete(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { error } = await supabase.from('workspaces').delete().eq('id', id);
    if (error) throw error;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export const dashboardApi = {
  async getMetrics(): Promise<DashboardMetrics> {
    const agents = await agentsApi.list();
    const totalToday = agents.reduce((sum, a) => sum + a.stats.today, 0);
    const totalEscalated = agents.reduce((sum, a) => sum + a.stats.escalated, 0);
    const resolved = totalToday - totalEscalated;
    return {
      activeAgents: agents.filter((a) => a.status === 'online').length,
      totalToday,
      resolutionRate: totalToday > 0 ? Math.round((resolved / totalToday) * 100) : 0,
      escalationsToday: totalEscalated,
      trends: { agents: 0, conversations: 0, resolution: 0, escalations: 0 },
    };
  },
};
