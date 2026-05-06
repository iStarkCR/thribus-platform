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
  DashboardMetrics,
  Escalation,
  Execution,
  TestAgentPayload,
  TestAgentResponse,
  Tool,
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

function rowToAgent(r: AgentRow): Agent {
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

interface ToolRow {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: Tool['method'];
  scope: string;
  active: boolean;
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
  cost_usd: number;
  created_at: string;
  agents?: { name: string; client: string };
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

export const agentsApi = {
  async list(): Promise<Agent[]> {
    if (!supabase) return SEED_AGENTS;
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as AgentRow[]).map(rowToAgent);
  },

  async get(id: string): Promise<Agent> {
    if (!supabase) {
      const a = SEED_AGENTS.find((x) => x.id === id);
      if (!a) throw new Error('Agent not found');
      return a;
    }
    const { data, error } = await supabase.from('agents').select('*').eq('id', id).single();
    if (error) throw error;
    return rowToAgent(data as AgentRow);
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
    const { data, error } = await supabase
      .from('agents')
      .insert({
        name: payload.name,
        client: payload.client,
        sector: payload.sector,
        type: payload.type,
        model: payload.model,
        system_prompt: payload.systemPrompt,
        tools: payload.tools,
        channel: payload.channel ?? null,
        status: 'standby',
      })
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
      .select('*, agents(name, client)')
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
