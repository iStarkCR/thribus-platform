/**
 * Thribus Agents — API Service Layer
 *
 * Ponto central de integração com o backend.
 * Todos os endpoints apontam para a API que será construída
 * (Supabase Edge Functions ou servidor dedicado).
 *
 * Enquanto o backend não estiver pronto, os métodos retornam
 * dados mock via SEED_DATA.
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

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      // Authorization será injetado via interceptor quando auth estiver pronta
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ═══════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════

export const agentsApi = {
  async list(): Promise<Agent[]> {
    // TODO: return request<Agent[]>('/agents');
    return SEED_AGENTS;
  },

  async get(id: string): Promise<Agent> {
    // TODO: return request<Agent>(`/agents/${id}`);
    const agent = SEED_AGENTS.find((a) => a.id === id);
    if (!agent) throw new Error('Agent not found');
    return agent;
  },

  async create(payload: CreateAgentPayload): Promise<Agent> {
    // TODO: return request<Agent>('/agents', { method: 'POST', body: JSON.stringify(payload) });
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
  },

  async update(id: string, payload: Partial<Agent>): Promise<Agent> {
    // TODO: return request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    const idx = SEED_AGENTS.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Agent not found');
    SEED_AGENTS[idx] = { ...SEED_AGENTS[idx], ...payload, updatedAt: new Date().toISOString() };
    return SEED_AGENTS[idx];
  },

  async toggleStatus(id: string): Promise<Agent> {
    const agent = await this.get(id);
    const newStatus = agent.status === 'online' ? 'standby' : 'online';
    return this.update(id, { status: newStatus });
  },

  async delete(id: string): Promise<void> {
    // TODO: return request<void>(`/agents/${id}`, { method: 'DELETE' });
    const idx = SEED_AGENTS.findIndex((a) => a.id === id);
    if (idx !== -1) SEED_AGENTS.splice(idx, 1);
  },

  async test(_payload: TestAgentPayload): Promise<TestAgentResponse> {
    // TODO: return request<TestAgentResponse>('/agents/test', { method: 'POST', body: JSON.stringify(_payload) });
    // Simula chamada ao loop agêntico
    await new Promise((r) => setTimeout(r, 1800));
    return {
      response:
        'Olá! Sou o suporte da Texnet. Identifiquei sua conta pelo número. Vi que sua conexão está instável — consultei sua ONU e o sinal está em -28dBm, abaixo do ideal. Vou fazer um reinício remoto. Aguarde 2 minutos e teste sua conexão.',
      toolsUsed: ['consultar_cliente', 'consultar_contrato', 'consultar_onu', 'reiniciar_onu'],
      tokensUsed: 1240,
      responseTime: 2.3,
    };
  },
};

// ═══════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════

export type CreateToolPayload = Omit<Tool, 'id'>;

export const toolsApi = {
  async list(): Promise<Tool[]> {
    // TODO: return request<Tool[]>('/tools');
    return SEED_TOOLS;
  },

  async getByScope(scope: string): Promise<Tool[]> {
    const all = await this.list();
    if (scope === 'all') return all;
    return all.filter((t) => t.scope.toLowerCase() === scope.toLowerCase());
  },

  async create(payload: CreateToolPayload): Promise<Tool> {
    // TODO: return request<Tool>('/tools', { method: 'POST', body: JSON.stringify(payload) });
    const newTool: Tool = {
      id: `tool-${Date.now()}`,
      ...payload,
    };
    SEED_TOOLS.push(newTool);
    return newTool;
  },

  async update(id: string, payload: Partial<Tool>): Promise<Tool> {
    // TODO: return request<Tool>(`/tools/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    const idx = SEED_TOOLS.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Tool not found');
    SEED_TOOLS[idx] = { ...SEED_TOOLS[idx], ...payload };
    return SEED_TOOLS[idx];
  },

  async toggleActive(id: string): Promise<Tool> {
    const tool = SEED_TOOLS.find((t) => t.id === id);
    if (!tool) throw new Error('Tool not found');
    return this.update(id, { active: !tool.active });
  },

  async delete(id: string): Promise<void> {
    // TODO: return request<void>(`/tools/${id}`, { method: 'DELETE' });
    const idx = SEED_TOOLS.findIndex((t) => t.id === id);
    if (idx !== -1) SEED_TOOLS.splice(idx, 1);
  },
};

// ═══════════════════════════════════════
// EXECUTIONS
// ═══════════════════════════════════════

export const executionsApi = {
  async list(limit = 20): Promise<Execution[]> {
    // TODO: return request<Execution[]>(`/executions?limit=${limit}`);
    return SEED_EXECUTIONS.slice(0, limit);
  },

  async getByAgent(agentId: string): Promise<Execution[]> {
    const all = await this.list(100);
    return all.filter((e) => e.agentId === agentId);
  },
};

// ═══════════════════════════════════════
// ESCALATIONS
// ═══════════════════════════════════════

export const escalationsApi = {
  async listPending(): Promise<Escalation[]> {
    // TODO: return request<Escalation[]>('/escalations?status=pending');
    return SEED_ESCALATIONS;
  },
};

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════

export const dashboardApi = {
  async getMetrics(): Promise<DashboardMetrics> {
    // TODO: return request<DashboardMetrics>('/dashboard/metrics');
    const agents = await agentsApi.list();
    return {
      activeAgents: agents.filter((a) => a.status === 'online').length,
      totalToday: agents.reduce((sum, a) => sum + a.stats.today, 0),
      resolutionRate: 91,
      escalationsToday: agents.reduce((sum, a) => sum + a.stats.escalated, 0),
      trends: {
        agents: 1,
        conversations: 18,
        resolution: 4,
        escalations: -9,
      },
    };
  },
};

// Re-export types
export { request };
