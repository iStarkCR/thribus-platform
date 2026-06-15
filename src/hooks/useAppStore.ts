import { create } from 'zustand';
import type { Agent, AgentSkill, AgentTemplate, DashboardMetrics, Escalation, Execution, Sector, Skill, Tool, Workspace, CreateWorkspacePayload } from '@/types';
import { agentsApi, dashboardApi, escalationsApi, executionsApi, skillsApi, templatesApi, toolsApi, workspacesApi, type CreateToolPayload } from '@/services/api';
import { listSectors } from '@/services/sectors';

interface AppState {
  // Data
  agents: Agent[];
  tools: Tool[];
  workspaces: Workspace[];
  /** Conta/workspace ativo — escopa o painel inteiro (estilo Talki). null = todos. */
  activeWorkspaceId: string | null;
  /** Setores (organograma) da conta ativa. */
  sectors: Sector[];
  executions: Execution[];
  escalations: Escalation[];
  metrics: DashboardMetrics | null;
  /** M3: catálogo de skills disponíveis. Carregado via initialize(). */
  skills: Skill[];
  /** M3: instalações de skill por agente — chave = agentId. Lazy. */
  agentSkills: Record<string, Array<{ skill: Skill; instance: AgentSkill }>>;
  /** M1: templates pra onboarding rápido de agentes. */
  templates: AgentTemplate[];

  // UI
  loading: boolean;
  currentPage: string;
  /** Sidebar recolhida (só ícones). Padrão recolhido no chat. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toasts: Array<{ id: string; message: string; type: 'green' | 'amber' | 'red' | 'blue' }>;
  /** Confirmação imperativa no padrão do sistema (substitui window.confirm). */
  confirmRequest: { title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null;
  /** Prompt imperativo no padrão do sistema (substitui window.prompt). */
  promptRequest: { title: string; label?: string; placeholder?: string; initial?: string; confirmLabel?: string; resolve: (v: string | null) => void } | null;

  // Actions
  initialize: () => Promise<void>;
  setPage: (page: string) => void;
  /** Troca a conta ativa e re-escopa os dados do painel. */
  setActiveWorkspace: (id: string) => Promise<void>;

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

  // Workspace actions
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (payload: CreateWorkspacePayload) => Promise<void>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  // Skill actions (M3)
  loadSkills: () => Promise<void>;
  loadAgentSkills: (agentId: string) => Promise<void>;
  installSkill: (agentId: string, skillId: string) => Promise<void>;
  toggleSkill: (agentSkillId: string, agentId: string, enabled: boolean) => Promise<void>;
  uninstallSkill: (agentSkillId: string, agentId: string) => Promise<void>;
  /** M4 — autoria. Cria nova skill no catálogo. */
  createSkill: (payload: Parameters<typeof skillsApi.create>[0]) => Promise<Skill | null>;
  updateSkill: (skillId: string, payload: Parameters<typeof skillsApi.update>[1]) => Promise<Skill | null>;
  deleteSkill: (skillId: string) => Promise<boolean>;
  /** M4 — marketplace. Forka skill pública pra workspace privado (editável). */
  forkSkill: (skillId: string, workspaceId: string) => Promise<Skill | null>;

  /** M1 — gestão de templates. */
  loadTemplates: () => Promise<void>;
  createTemplate: (payload: Parameters<typeof templatesApi.create>[0]) => Promise<AgentTemplate | null>;
  updateTemplate: (id: string, payload: Parameters<typeof templatesApi.update>[1]) => Promise<AgentTemplate | null>;
  deleteTemplate: (id: string) => Promise<boolean>;
  /** M4 — marketplace. Forka template público pra workspace privado. */
  forkTemplate: (templateId: string, workspaceId: string) => Promise<AgentTemplate | null>;

  // Toast
  addToast: (message: string, type?: 'green' | 'amber' | 'red' | 'blue') => void;
  removeToast: (id: string) => void;

  // Confirmação (modal do sistema)
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  resolveConfirm: (v: boolean) => void;
  // Prompt (modal do sistema)
  askPrompt: (opts: { title: string; label?: string; placeholder?: string; initial?: string; confirmLabel?: string }) => Promise<string | null>;
  resolvePrompt: (v: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  agents: [],
  tools: [],
  workspaces: [],
  activeWorkspaceId: null,
  sectors: [],
  executions: [],
  escalations: [],
  metrics: null,
  skills: [],
  agentSkills: {},
  templates: [],
  loading: true,
  currentPage: 'dashboard',
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toasts: [],
  confirmRequest: null,
  promptRequest: null,

  initialize: async () => {
    set({ loading: true });
    try {
      // Carrega workspaces primeiro pra resolver a conta ativa antes de escopar.
      const workspaces = await workspacesApi.list().catch(() => [] as Workspace[]);
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('activeWorkspaceId') : null;
      const valid = stored && workspaces.some((w) => w.id === stored) ? stored : null;
      const preferred = workspaces.find((w) => w.name.trim().toLowerCase() === 'thribus tech');
      const activeWorkspaceId = valid ?? preferred?.id ?? workspaces[0]?.id ?? null;

      const [agents, tools, executions, escalations, metrics, skills, templates, sectors] = await Promise.all([
        agentsApi.list(activeWorkspaceId),
        toolsApi.list(),
        executionsApi.list(),
        escalationsApi.listPending(),
        dashboardApi.getMetrics(),
        // skillsApi.list já degrada pra [] se schema não existe — não precisa catch
        skillsApi.list(),
        templatesApi.list().catch(() => [] as AgentTemplate[]),
        listSectors(activeWorkspaceId).catch(() => [] as Sector[]),
      ]);

      // Escopa execuções/escalações pelos agentes da conta ativa.
      const agentIds = new Set(agents.map((a) => a.id));
      const scope = <T extends { agentId: string }>(rows: T[]) =>
        activeWorkspaceId ? rows.filter((r) => agentIds.has(r.agentId)) : rows;

      set({
        workspaces,
        activeWorkspaceId,
        sectors,
        agents,
        tools,
        executions: scope(executions),
        escalations: scope(escalations),
        metrics,
        skills,
        templates,
        loading: false,
      });
    } catch {
      set({ loading: false });
      get().addToast('Erro ao carregar dados', 'red');
    }
  },

  setPage: (page) => set({ currentPage: page }),

  setActiveWorkspace: async (id) => {
    if (id === get().activeWorkspaceId) return;
    if (typeof localStorage !== 'undefined') localStorage.setItem('activeWorkspaceId', id);
    set({ activeWorkspaceId: id });
    await get().initialize();
  },

  loadAgents: async () => {
    const agents = await agentsApi.list(get().activeWorkspaceId);
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

  loadWorkspaces: async () => {
    const workspaces = await workspacesApi.list();
    set({ workspaces });
  },

  createWorkspace: async (payload) => {
    const ws = await workspacesApi.create(payload);
    set({ workspaces: [...get().workspaces, ws] });
    get().addToast('Workspace criado', 'green');
  },

  updateWorkspace: async (id, data) => {
    const ws = await workspacesApi.update(id, data);
    set({ workspaces: get().workspaces.map((w) => (w.id === id ? ws : w)) });
    get().addToast('Workspace atualizado', 'green');
  },

  deleteWorkspace: async (id) => {
    await workspacesApi.delete(id);
    set({ workspaces: get().workspaces.filter((w) => w.id !== id) });
    get().addToast('Workspace removido', 'amber');
  },

  // ─── Skills (M3) ─────────────────────────────────────────────────────────
  loadSkills: async () => {
    const skills = await skillsApi.list();
    set({ skills });
  },

  loadAgentSkills: async (agentId) => {
    const list = await skillsApi.listByAgent(agentId);
    set((s) => ({ agentSkills: { ...s.agentSkills, [agentId]: list } }));
  },

  installSkill: async (agentId, skillId) => {
    try {
      await skillsApi.install(agentId, skillId);
      await get().loadAgentSkills(agentId);
      get().addToast('Skill instalada', 'green');
    } catch (err) {
      console.error('installSkill failed', err);
      get().addToast('Falha ao instalar skill', 'red');
    }
  },

  toggleSkill: async (agentSkillId, agentId, enabled) => {
    try {
      await skillsApi.toggle(agentSkillId, enabled);
      await get().loadAgentSkills(agentId);
      get().addToast(enabled ? 'Skill ativada' : 'Skill desativada', enabled ? 'green' : 'amber');
    } catch (err) {
      console.error('toggleSkill failed', err);
      get().addToast('Falha ao alterar skill', 'red');
    }
  },

  uninstallSkill: async (agentSkillId, agentId) => {
    try {
      await skillsApi.uninstall(agentSkillId);
      await get().loadAgentSkills(agentId);
      get().addToast('Skill removida', 'amber');
    } catch (err) {
      console.error('uninstallSkill failed', err);
      get().addToast('Falha ao remover skill', 'red');
    }
  },

  createSkill: async (payload) => {
    try {
      const created = await skillsApi.create(payload);
      set((s) => ({ skills: [...s.skills, created] }));
      get().addToast(`Skill "${created.name}" criada`, 'green');
      return created;
    } catch (err) {
      console.error('createSkill failed', err);
      const msg = err instanceof Error ? err.message : 'Falha ao criar skill';
      get().addToast(msg.includes('duplicate key') ? 'Slug já existe' : 'Falha ao criar skill', 'red');
      return null;
    }
  },

  updateSkill: async (skillId, payload) => {
    try {
      const updated = await skillsApi.update(skillId, payload);
      set((s) => ({ skills: s.skills.map((sk) => (sk.id === skillId ? updated : sk)) }));
      get().addToast(`Skill "${updated.name}" atualizada`, 'green');
      return updated;
    } catch (err) {
      console.error('updateSkill failed', err);
      get().addToast('Falha ao atualizar skill', 'red');
      return null;
    }
  },

  deleteSkill: async (skillId) => {
    try {
      await skillsApi.delete(skillId);
      set((s) => ({ skills: s.skills.filter((sk) => sk.id !== skillId) }));
      get().addToast('Skill removida do catálogo', 'amber');
      return true;
    } catch (err) {
      console.error('deleteSkill failed', err);
      const msg = err instanceof Error ? err.message : 'Falha ao deletar skill';
      get().addToast(msg, 'red');
      return false;
    }
  },

  forkSkill: async (skillId, workspaceId) => {
    try {
      const forked = await skillsApi.fork(skillId, workspaceId);
      set((s) => ({ skills: [...s.skills, forked] }));
      get().addToast(`Skill forkada como "${forked.name}" — edite à vontade`, 'green');
      return forked;
    } catch (err) {
      console.error('forkSkill failed', err);
      get().addToast('Falha ao forkar skill', 'red');
      return null;
    }
  },

  // ─── M1 Templates (CRUD) ──────────────────────────────────────────────────
  loadTemplates: async () => {
    try {
      const templates = await templatesApi.list();
      set({ templates });
    } catch (err) {
      console.error('loadTemplates failed', err);
    }
  },

  createTemplate: async (payload) => {
    try {
      const created = await templatesApi.create(payload);
      set((s) => ({ templates: [...s.templates, created] }));
      get().addToast(`Template "${created.name}" criado`, 'green');
      return created;
    } catch (err) {
      console.error('createTemplate failed', err);
      const msg = err instanceof Error ? err.message : 'Falha ao criar template';
      get().addToast(msg.includes('duplicate key') ? 'Slug já existe' : 'Falha ao criar template', 'red');
      return null;
    }
  },

  updateTemplate: async (id, payload) => {
    try {
      const updated = await templatesApi.update(id, payload);
      set((s) => ({ templates: s.templates.map((t) => (t.id === id ? updated : t)) }));
      get().addToast(`Template "${updated.name}" atualizado`, 'green');
      return updated;
    } catch (err) {
      console.error('updateTemplate failed', err);
      get().addToast('Falha ao atualizar template', 'red');
      return null;
    }
  },

  deleteTemplate: async (id) => {
    try {
      await templatesApi.delete(id);
      set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
      get().addToast('Template removido', 'amber');
      return true;
    } catch (err) {
      console.error('deleteTemplate failed', err);
      get().addToast('Falha ao deletar template', 'red');
      return false;
    }
  },

  forkTemplate: async (templateId, workspaceId) => {
    try {
      const forked = await templatesApi.fork(templateId, workspaceId);
      set((s) => ({ templates: [...s.templates, forked] }));
      get().addToast(`Template forkado como "${forked.name}" — edite à vontade`, 'green');
      return forked;
    } catch (err) {
      console.error('forkTemplate failed', err);
      get().addToast('Falha ao forkar template', 'red');
      return null;
    }
  },

  addToast: (message, type = 'green') => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 3500);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  askConfirm: (opts) =>
    new Promise<boolean>((resolve) => set({ confirmRequest: { ...opts, resolve } })),

  resolveConfirm: (v) => {
    get().confirmRequest?.resolve(v);
    set({ confirmRequest: null });
  },

  askPrompt: (opts) =>
    new Promise<string | null>((resolve) => set({ promptRequest: { ...opts, resolve } })),

  resolvePrompt: (v) => {
    get().promptRequest?.resolve(v);
    set({ promptRequest: null });
  },
}));
