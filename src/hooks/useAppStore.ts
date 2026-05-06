import { create } from 'zustand';
import type { Agent, DashboardMetrics, Escalation, Execution, Tool } from '@/types';
import { agentsApi, dashboardApi, escalationsApi, executionsApi, toolsApi, type CreateToolPayload } from '@/services/api';

interface AppState {
  // Data
  agents: Agent[];
  tools: Tool[];
  executions: Execution[];
  escalations: Escalation[];
  metrics: DashboardMetrics | null;

  // UI
  loading: boolean;
  currentPage: string;
  toasts: Array<{ id: string; message: string; type: 'green' | 'amber' | 'red' | 'blue' }>;

  // Actions
  initialize: () => Promise<void>;
  setPage: (page: string) => void;

  // Agent actions
  loadAgents: () => Promise<void>;
  toggleAgent: (id: string) => Promise<void>;
  updateAgent: (id: string, data: Partial<Agent>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;

  // Tool actions
  loadTools: () => Promise<void>;
  createTool: (payload: CreateToolPayload) => Promise<void>;
  updateTool: (id: string, data: Partial<Tool>) => Promise<void>;
  toggleTool: (id: string) => Promise<void>;
  deleteTool: (id: string) => Promise<void>;

  // Toast
  addToast: (message: string, type?: 'green' | 'amber' | 'red' | 'blue') => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  agents: [],
  tools: [],
  executions: [],
  escalations: [],
  metrics: null,
  loading: true,
  currentPage: 'dashboard',
  toasts: [],

  initialize: async () => {
    set({ loading: true });
    try {
      const [agents, tools, executions, escalations, metrics] = await Promise.all([
        agentsApi.list(),
        toolsApi.list(),
        executionsApi.list(),
        escalationsApi.listPending(),
        dashboardApi.getMetrics(),
      ]);
      set({ agents, tools, executions, escalations, metrics, loading: false });
    } catch {
      set({ loading: false });
      get().addToast('Erro ao carregar dados', 'red');
    }
  },

  setPage: (page) => set({ currentPage: page }),

  loadAgents: async () => {
    const agents = await agentsApi.list();
    set({ agents });
  },

  toggleAgent: async (id) => {
    const agent = await agentsApi.toggleStatus(id);
    const agents = get().agents.map((a) => (a.id === id ? agent : a));
    set({ agents });
    get().addToast(
      agent.status === 'online' ? 'Colaborador ativado' : 'Colaborador pausado',
      agent.status === 'online' ? 'green' : 'amber',
    );
  },

  updateAgent: async (id, data) => {
    const agent = await agentsApi.update(id, data);
    const agents = get().agents.map((a) => (a.id === id ? agent : a));
    set({ agents });
    get().addToast('Alterações salvas', 'green');
  },

  deleteAgent: async (id) => {
    await agentsApi.delete(id);
    set({ agents: get().agents.filter((a) => a.id !== id) });
    get().addToast('Colaborador removido', 'amber');
  },

  loadTools: async () => {
    const tools = await toolsApi.list();
    set({ tools });
  },

  createTool: async (payload) => {
    const tool = await toolsApi.create(payload);
    set({ tools: [...get().tools, tool] });
    get().addToast('Ferramenta criada', 'green');
  },

  updateTool: async (id, data) => {
    const tool = await toolsApi.update(id, data);
    set({ tools: get().tools.map((t) => (t.id === id ? tool : t)) });
    get().addToast('Ferramenta atualizada', 'green');
  },

  toggleTool: async (id) => {
    const tool = await toolsApi.toggleActive(id);
    set({ tools: get().tools.map((t) => (t.id === id ? tool : t)) });
    get().addToast(tool.active ? 'Ferramenta ativada' : 'Ferramenta desativada', tool.active ? 'green' : 'amber');
  },

  deleteTool: async (id) => {
    await toolsApi.delete(id);
    set({ tools: get().tools.filter((t) => t.id !== id) });
    get().addToast('Ferramenta removida', 'amber');
  },

  addToast: (message, type = 'green') => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 3500);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
