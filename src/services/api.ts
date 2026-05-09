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
  AgentSkill,
  AgentTemplate,
  CreateAgentPayload,
  CreateWorkspacePayload,
  DashboardMetrics,
  Escalation,
  Execution,
  Skill,
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
  role: Agent['role'] | null;
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
    role: r.role ?? undefined,
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
  router_config: Workspace['routerConfig'] | null;
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
    routerConfig: r.router_config && typeof r.router_config === 'object' ? r.router_config : undefined,
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
    if (payload.role) insertPayload.role = payload.role;

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
    if (payload.role !== undefined) {
      (update as Record<string, unknown>).role = payload.role || null;
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
        router_config: payload.routerConfig ?? null,
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
    if (payload.routerConfig !== undefined) update.router_config = payload.routerConfig ?? null;

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
// AGENT TEMPLATES (M1 — onboarding rápido)
// ═══════════════════════════════════════════════════════════════════════════

interface AgentTemplateRow {
  id: string;
  slug: string;
  name: string;
  sector: string;
  description: string;
  base_prompt: string;
  default_tools: string[];
  default_model: string;
  icon: string | null;
  is_public: boolean;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(r: AgentTemplateRow): AgentTemplate {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    sector: r.sector,
    description: r.description,
    basePrompt: r.base_prompt,
    defaultTools: r.default_tools ?? [],
    defaultModel: r.default_model,
    icon: r.icon ?? undefined,
    isPublic: r.is_public,
    workspaceId: r.workspace_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILLS (M3 — empacotamento reutilizável)
// ═══════════════════════════════════════════════════════════════════════════

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  sector: string | null;
  icon: string | null;
  prompt_fragment: string;
  required_tools: string[];
  config_schema: Record<string, unknown>;
  is_public: boolean;
  workspace_id: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}

interface AgentSkillRow {
  id: string;
  agent_id: string;
  skill_id: string;
  config: Record<string, unknown>;
  enabled: boolean;
  installed_at: string;
}

function rowToSkill(r: SkillRow): Skill {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    sector: r.sector ?? undefined,
    icon: r.icon ?? undefined,
    promptFragment: r.prompt_fragment,
    requiredTools: r.required_tools ?? [],
    configSchema: r.config_schema ?? {},
    isPublic: r.is_public,
    workspaceId: r.workspace_id ?? undefined,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToAgentSkill(r: AgentSkillRow): AgentSkill {
  return {
    id: r.id,
    agentId: r.agent_id,
    skillId: r.skill_id,
    config: r.config ?? {},
    enabled: r.enabled,
    installedAt: r.installed_at,
  };
}

/**
 * Quando a migration 008 não foi aplicada, queries da skill quebram com
 * "relation does not exist". A UI degrada pra catálogo vazio em vez de
 * propagar erro — assim o painel funciona normalmente em ambientes sem M3.
 */
function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /relation .* does not exist/i.test(msg) || /could not find the table/i.test(msg);
}

export const skillsApi = {
  /**
   * Lista TODAS as skills (públicas + privadas). UI filtra por aba.
   * Inclui contagem de instalações pra ranking de marketplace.
   */
  async list(): Promise<Skill[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .order('sector', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;

      const skills = (data as SkillRow[]).map(rowToSkill);

      // Pega contagem de instalações em batch (1 query agregada)
      // Útil pra ranking "mais instaladas" no marketplace
      try {
        const { data: countData } = await supabase
          .from('agent_skills')
          .select('skill_id');
        const counts: Record<string, number> = {};
        for (const row of (countData ?? []) as Array<{ skill_id: string }>) {
          counts[row.skill_id] = (counts[row.skill_id] ?? 0) + 1;
        }
        return skills.map((s) => ({ ...s, installCount: counts[s.id] ?? 0 }));
      } catch {
        // Se contagem falha, retorna sem ela — não é crítico
        return skills.map((s) => ({ ...s, installCount: 0 }));
      }
    } catch (err) {
      if (isMissingTable(err)) return [];
      throw err;
    }
  },

  /** Skills instaladas num agente — retorna [{skill, instance}, ...]. */
  async listByAgent(agentId: string): Promise<Array<{ skill: Skill; instance: AgentSkill }>> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('agent_skills')
        .select(`
          id, agent_id, skill_id, config, enabled, installed_at,
          skills:skill_id (*)
        `)
        .eq('agent_id', agentId);
      if (error) throw error;
      return ((data ?? []) as Array<AgentSkillRow & { skills: SkillRow | SkillRow[] }>)
        .map((row) => {
          const skillRow = Array.isArray(row.skills) ? row.skills[0] : row.skills;
          if (!skillRow) return null;
          return {
            skill: rowToSkill(skillRow),
            instance: rowToAgentSkill(row),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch (err) {
      if (isMissingTable(err)) return [];
      throw err;
    }
  },

  /** Instala uma skill num agente (idempotente — upsert em (agent_id, skill_id)). */
  async install(agentId: string, skillId: string): Promise<AgentSkill> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('agent_skills')
      .upsert(
        { agent_id: agentId, skill_id: skillId, enabled: true, config: {} },
        { onConflict: 'agent_id,skill_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return rowToAgentSkill(data as AgentSkillRow);
  },

  /** Toggle enabled — desativa skill sem desinstalar. */
  async toggle(agentSkillId: string, enabled: boolean): Promise<AgentSkill> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('agent_skills')
      .update({ enabled })
      .eq('id', agentSkillId)
      .select()
      .single();
    if (error) throw error;
    return rowToAgentSkill(data as AgentSkillRow);
  },

  /** Desinstala completamente — remove do agent_skills. */
  async uninstall(agentSkillId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { error } = await supabase.from('agent_skills').delete().eq('id', agentSkillId);
    if (error) throw error;
  },

  // ─── CRUD de skills (M3 — autoria) ────────────────────────────────────────

  /**
   * Cria nova skill. Por default `is_public=true` pra ficar visível no
   * catálogo. Quando o user quiser privada (workspace_id setado), passar
   * is_public=false.
   *
   * O slug deve ser único (constraint do DB). Validação de formato fica
   * por conta do form.
   */
  async create(payload: {
    slug: string;
    name: string;
    description?: string;
    sector?: string;
    icon?: string;
    promptFragment: string;
    requiredTools: string[];
    isPublic?: boolean;
    workspaceId?: string;
    version?: string;
  }): Promise<Skill> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('skills')
      .insert({
        slug: payload.slug,
        name: payload.name,
        description: payload.description ?? '',
        sector: payload.sector ?? null,
        icon: payload.icon ?? null,
        prompt_fragment: payload.promptFragment,
        required_tools: payload.requiredTools,
        is_public: payload.isPublic ?? true,
        workspace_id: payload.workspaceId ?? null,
        version: payload.version ?? '1.0.0',
      })
      .select()
      .single();
    if (error) throw error;
    return rowToSkill(data as SkillRow);
  },

  /**
   * Atualiza skill existente. Bumpa o version automaticamente se o caller
   * não passar — ajuda quem instalou a skill a saber que precisa testar.
   */
  async update(skillId: string, payload: Partial<{
    name: string;
    description: string;
    sector: string | null;
    icon: string | null;
    promptFragment: string;
    requiredTools: string[];
    isPublic: boolean;
    version: string;
  }>): Promise<Skill> {
    if (!supabase) throw new Error('Supabase não configurado');
    const update: Record<string, unknown> = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.sector !== undefined) update.sector = payload.sector;
    if (payload.icon !== undefined) update.icon = payload.icon;
    if (payload.promptFragment !== undefined) update.prompt_fragment = payload.promptFragment;
    if (payload.requiredTools !== undefined) update.required_tools = payload.requiredTools;
    if (payload.isPublic !== undefined) update.is_public = payload.isPublic;
    if (payload.version !== undefined) update.version = payload.version;

    const { data, error } = await supabase
      .from('skills')
      .update(update)
      .eq('id', skillId)
      .select()
      .single();
    if (error) throw error;
    return rowToSkill(data as SkillRow);
  },

  /**
   * Fork: duplica skill pública como privada de um workspace.
   * Caso de uso: skill pública não bate 100% com o caso do user, ele forka
   * e edita a versão privada sem afetar o original.
   *
   * Slug fica `<original>-fork-<timestamp>` pra evitar colisão. User pode
   * renomear depois via update.
   */
  async fork(skillId: string, workspaceId: string): Promise<Skill> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data: original, error: fetchErr } = await supabase
      .from('skills')
      .select('*')
      .eq('id', skillId)
      .single();
    if (fetchErr) throw fetchErr;
    const orig = original as SkillRow;

    const ts = Date.now().toString(36);
    const newSlug = `${orig.slug}-fork-${ts}`;

    const { data, error } = await supabase
      .from('skills')
      .insert({
        slug: newSlug,
        name: `${orig.name} (fork)`,
        description: orig.description,
        sector: orig.sector,
        icon: orig.icon,
        prompt_fragment: orig.prompt_fragment,
        required_tools: orig.required_tools,
        config_schema: orig.config_schema,
        is_public: false, // forks nascem privados
        workspace_id: workspaceId,
        version: '1.0.0', // reseta versionamento
      })
      .select()
      .single();
    if (error) throw error;
    return rowToSkill(data as SkillRow);
  },

  /**
   * Deleta skill — só se não tiver instalações (FK cascade já removeria
   * agent_skills relacionados, mas preferimos bloquear pra forçar o user
   * desinstalar conscientemente antes).
   */
  async delete(skillId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase não configurado');
    // Conta instalações antes de deletar — UX honesta
    const { count, error: countErr } = await supabase
      .from('agent_skills')
      .select('*', { count: 'exact', head: true })
      .eq('skill_id', skillId);
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      throw new Error(`Skill em uso por ${count} agente(s). Desinstale antes de deletar.`);
    }
    const { error } = await supabase.from('skills').delete().eq('id', skillId);
    if (error) throw error;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// AGENT TEMPLATES API
// ═══════════════════════════════════════════════════════════════════════════

export const templatesApi = {
  /**
   * Lista TODOS os templates (públicos + privados). UI filtra por aba.
   * Inclui useCount heurístico (agents matching sector + tools).
   */
  async list(): Promise<AgentTemplate[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('agent_templates')
        .select('*')
        .order('sector', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      const templates = (data as AgentTemplateRow[]).map(rowToTemplate);

      // useCount: agents que parecem ter sido criados deste template.
      // Heurística: mesmo sector + mesmas tools default. Não é 100% preciso
      // mas dá ordem de grandeza pra ranking de "mais usado".
      try {
        const { data: agentsData } = await supabase
          .from('agents')
          .select('sector, tools');
        const counts: Record<string, number> = {};
        for (const t of templates) {
          const matches = (agentsData ?? []).filter((a) => {
            const ag = a as { sector?: string; tools?: string[] };
            if (ag.sector !== t.sector) return false;
            const aTools = JSON.stringify((ag.tools ?? []).slice().sort());
            const tTools = JSON.stringify(t.defaultTools.slice().sort());
            return aTools === tTools;
          });
          counts[t.id] = matches.length;
        }
        return templates.map((t) => ({ ...t, useCount: counts[t.id] ?? 0 }));
      } catch {
        return templates.map((t) => ({ ...t, useCount: 0 }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/relation .* does not exist/i.test(msg)) return [];
      throw err;
    }
  },

  async get(idOrSlug: string): Promise<AgentTemplate | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('agent_templates')
      .select('*')
      .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToTemplate(data as AgentTemplateRow) : null;
  },

  /**
   * Cria template a partir de payload arbitrário. Usado pelo "Salvar
   * como template" no AgentDetailModal — operador refina um agent e
   * salva o resultado como template reutilizável.
   *
   * Slug deve ser único (constraint do DB). Validação é responsabilidade
   * do form que chama.
   */
  async create(payload: {
    slug: string;
    name: string;
    sector: string;
    description?: string;
    basePrompt: string;
    defaultTools: string[];
    defaultModel: string;
    icon?: string;
    isPublic?: boolean;
    workspaceId?: string;
  }): Promise<AgentTemplate> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase
      .from('agent_templates')
      .insert({
        slug: payload.slug,
        name: payload.name,
        sector: payload.sector,
        description: payload.description ?? '',
        base_prompt: payload.basePrompt,
        default_tools: payload.defaultTools,
        default_model: payload.defaultModel,
        icon: payload.icon ?? null,
        is_public: payload.isPublic ?? true,
        workspace_id: payload.workspaceId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(data as AgentTemplateRow);
  },

  /**
   * Fork: duplica template público como privado de um workspace.
   * Igual padrão do skillsApi.fork — slug auto-gerado pra evitar colisão.
   */
  async fork(templateId: string, workspaceId: string): Promise<AgentTemplate> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data: original, error: fetchErr } = await supabase
      .from('agent_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (fetchErr) throw fetchErr;
    const orig = original as AgentTemplateRow;

    const ts = Date.now().toString(36);
    const newSlug = `${orig.slug}-fork-${ts}`;

    const { data, error } = await supabase
      .from('agent_templates')
      .insert({
        slug: newSlug,
        name: `${orig.name} (fork)`,
        sector: orig.sector,
        description: orig.description,
        base_prompt: orig.base_prompt,
        default_tools: orig.default_tools,
        default_model: orig.default_model,
        icon: orig.icon,
        is_public: false, // forks nascem privados
        workspace_id: workspaceId,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(data as AgentTemplateRow);
  },

  /**
   * Atualiza template — slug é imutável (preserva FKs lógicas se houver).
   * Outros campos podem ser editados livremente.
   */
  async update(id: string, payload: Partial<{
    name: string;
    sector: string;
    description: string;
    basePrompt: string;
    defaultTools: string[];
    defaultModel: string;
    icon: string | null;
    isPublic: boolean;
  }>): Promise<AgentTemplate> {
    if (!supabase) throw new Error('Supabase não configurado');
    const update: Record<string, unknown> = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.sector !== undefined) update.sector = payload.sector;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.basePrompt !== undefined) update.base_prompt = payload.basePrompt;
    if (payload.defaultTools !== undefined) update.default_tools = payload.defaultTools;
    if (payload.defaultModel !== undefined) update.default_model = payload.defaultModel;
    if (payload.icon !== undefined) update.icon = payload.icon;
    if (payload.isPublic !== undefined) update.is_public = payload.isPublic;

    const { data, error } = await supabase
      .from('agent_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(data as AgentTemplateRow);
  },

  /**
   * Deleta template. Não tem FK pra agents — agentes criados a partir
   * dele já são entidades independentes, então deletar não afeta os
   * agentes existentes.
   */
  async delete(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { error } = await supabase.from('agent_templates').delete().eq('id', id);
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
