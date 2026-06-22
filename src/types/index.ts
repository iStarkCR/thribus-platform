// ═══════════════════════════════════════
// AGENT TYPES
// ═══════════════════════════════════════

export type AgentStatus = 'online' | 'standby' | 'offline';
export type AgentType = 'modular' | 'operacional' | 'enterprise';
export type AIModel =
  // Anthropic — IDs verificados em maio/2026.
  // ⚠️ Mantenha sincronizado com src/lib/models.ts (fonte única de verdade
  //    pra dropdowns + pricing). Adicionar ID aqui sem testar contra
  //    /v1/models do provedor quebra o worker em runtime com 404.
  | 'claude-opus-4-7'               // Opus 4.7 (premium — análise/retenção/auditoria)
  | 'claude-sonnet-4-5-20250929'    // Sonnet 4.5 (recomendado — uso geral)
  | 'claude-haiku-4-5-20251001'     // Haiku 4.5 (rápido/barato — alta volumetria)
  // OpenAI
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export interface AgentStats {
  today: number;
  resolution: number;      // percentage 0-100
  avgResponseTime: number;  // seconds
  escalated: number;
  total?: number;          // total de demandas (mensagens do usuário) — all-time
}

/** Papel do agente — usado pelo roteador multi-agente (M2). */
export type AgentRole = 'sales' | 'support' | 'finance' | 'retention' | 'generic';

export interface Agent {
  id: string;
  name: string;
  client: string;
  sector: string;
  type: AgentType;
  status: AgentStatus;
  model: AIModel;
  systemPrompt: string;
  tools: string[];
  channel?: string;       // slug do canal (ex: texnet-duall) — usado pelo worker
  workspaceId?: string;   // multi-tenant — vincula a um workspace com creds
  role?: AgentRole;       // M2: papel do agente (sales/support/finance/...)
  sectorId?: string;      // FK pra sectors — organograma da empresa
  isSupervisor?: boolean; // supervisor (ex: Bukowiski COO) — coroa + badge
  avatarUrl?: string;     // foto do colaborador (bucket agent-avatars) — Fase 4
  displayName?: string;   // nome de exibição (override de name) — Fase 4
  color?: string;         // cor do avatar/tema (hex) — Fase 4
  stats: AgentStats;
  createdAt: string;
  updatedAt: string;
}

/** Setor (departamento) de uma empresa/workspace — organograma. */
export interface Sector {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
}

// ═══════════════════════════════════════
// WORKSPACE (multi-tenant)
// ═══════════════════════════════════════

export type LLMProvider = 'openai' | 'anthropic';
export type CRMProvider = 'talki' | 'texnet';

/**
 * Config do roteador multi-agente do workspace (M2).
 * Quando enabled=true, a 1ª msg da conversa é classificada por LLM
 * e o worker direciona pro agent_id apropriado.
 */
export interface RouterConfig {
  enabled: boolean;
  model?: string;              // gpt-4o-mini default — barato pra classificar
  router_prompt: string;        // prompt de classificação
  intents: Record<string, string>; // intent → agent_id
  fallback_agent_id?: string;
}

export interface Workspace {
  id: string;
  name: string;
  llmProvider: LLMProvider;
  /**
   * @deprecated use `anthropicApiKey` ou `openaiApiKey`. Mantido pra
   * retrocompat — o worker ainda lê como fallback se a chave do provider
   * específico não estiver setada.
   */
  llmApiKey?: string;
  /** API key Anthropic — usada quando agent.model começa com "claude-". */
  anthropicApiKey?: string;
  /** API key OpenAI — usada quando agent.model começa com "gpt-"/"o1-"/"o3-". */
  openaiApiKey?: string;
  crmProvider?: CRMProvider;
  crmBaseUrl?: string;
  crmAccountId?: string;
  crmApiToken?: string;
  texnetBotSenderId?: string;
  talkiRequiredLabel?: string;
  /**
   * Cofre de credenciais do cliente (tokens, hashes, API keys).
   * Tools referenciam por nome simbólico em auth_credentials.*_ref.
   * Ex: { "ixc_token": "AB12...", "ixc_hash": "xyz...", "hubspot_key": "..." }
   */
  credentials?: Record<string, string>;
  /** M2: roteamento multi-agente. */
  routerConfig?: RouterConfig;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateWorkspacePayload = Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>;

// ═══════════════════════════════════════
// AGENT TEMPLATES (M1 — onboarding rápido)
// ═══════════════════════════════════════

/**
 * Template pré-pronto pra criar agente em poucos cliques.
 * Cliente novo escolhe template → preenche variáveis → tem agente funcional.
 */
export interface AgentTemplate {
  id: string;
  slug: string;                    // "vendas-isp", "suporte-isp"
  name: string;                    // "Vendedor ISP (Bianca)"
  sector: string;                  // "isp", "clinica", "ecommerce"
  description: string;
  basePrompt: string;              // system_prompt template (com {VARIÁVEIS})
  defaultTools: string[];          // tools que vêm habilitadas
  defaultModel: AIModel | string;
  icon?: string;                   // emoji ou nome
  isPublic: boolean;
  /** M4: se setado, template é privado deste workspace (forkado/custom). */
  workspaceId?: string;
  /** Heurística: agents que parecem ter sido criados a partir deste template. */
  useCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAgentPayload {
  name: string;
  client: string;
  sector: string;
  type: AgentType;
  model: AIModel;
  systemPrompt: string;
  tools: string[];
  channel?: string;
  workspaceId?: string;
  role?: AgentRole;
}

// ═══════════════════════════════════════
// SKILLS (M3 — empacotamento reutilizável)
// ═══════════════════════════════════════

/**
 * Skill empacotada — módulo reutilizável que combina prompt + tools + config.
 *
 * Diferente de templates (que criam um agente do zero), skills são adicionadas
 * a agentes existentes. Um agente "Vendedor ISP" pode receber a skill
 * "Cobrança Amigável" e passar a saber lidar com inadimplência sem virar
 * outro agente.
 *
 * M3 está em scaffold — o worker AINDA NÃO consome skills no agent loop.
 * Próximo passo: M3-runtime injeta `prompt_fragment` no system_prompt e
 * adiciona `required_tools` ao set de tools disponíveis.
 */
export interface Skill {
  id: string;
  slug: string;                                // 'consulta-viabilidade-isp'
  name: string;                                // "Consulta de Viabilidade (ISP)"
  description: string;
  sector?: string;                             // 'isp' | 'clinica' | ... (filtro de catálogo)
  icon?: string;                               // emoji ou nome
  promptFragment: string;                      // texto a concatenar no system_prompt
  requiredTools: string[];                     // nomes de tools necessárias
  configSchema?: Record<string, unknown>;      // JSON Schema dos params configuráveis
  isPublic: boolean;
  workspaceId?: string;                        // null = built-in/global
  version: string;                             // semver
  /** M4 marketplace — quantos agentes têm essa skill instalada (computado em runtime). */
  installCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Instância da skill habilitada num agente, com config opcional override. */
export interface AgentSkill {
  id: string;
  agentId: string;
  skillId: string;
  config: Record<string, unknown>;
  enabled: boolean;
  installedAt: string;
}

// ═══════════════════════════════════════
// TOOL TYPES
// ═══════════════════════════════════════

export type ToolAuthType = 'basic' | 'bearer' | 'apikey';

/**
 * Refs para as credenciais armazenadas no `workspace.credentials`.
 * Formato muda por tipo de auth:
 *  - basic:  { usernameRef, passwordRef }
 *  - bearer: { tokenRef }
 *  - apikey: { headerName, valueRef }
 */
export interface ToolAuthCredentials {
  usernameRef?: string;
  passwordRef?: string;
  tokenRef?: string;
  headerName?: string;
  valueRef?: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  scope: string;        // client name or "global"
  active: boolean;
  parameters?: ToolParameter[];
  authType?: ToolAuthType;
  authCredentials?: ToolAuthCredentials;
  extraHeaders?: Record<string, string>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
}

// ═══════════════════════════════════════
// EXECUTION / LOG TYPES
// ═══════════════════════════════════════

export type ExecutionStatus = 'resolved' | 'escalated' | 'failed' | 'running';

export interface Execution {
  id: string;
  agentId: string;
  agentName: string;
  clientName: string;
  customerName: string;
  status: ExecutionStatus;
  toolsUsed: string[];
  responseTime: number;    // seconds
  tokensUsed: number;
  cacheReadTokens?: number; // Anthropic prompt cache — reduz custo
  model?: AIModel | string; // model do agent — usado pra estimar custo
  cost: number;            // USD (DB se > 0, senão estimado em runtime via pricing.ts)
  timestamp: string;
  conversationId?: string;
}

// ═══════════════════════════════════════
// ESCALATION TYPES
// ═══════════════════════════════════════

export interface Escalation {
  id: string;
  agentId: string;
  agentName: string;
  customerName: string;
  reason: string;
  waitTime: number;        // minutes
  priority: 'low' | 'medium' | 'high' | 'critical';
  conversationId: string;
  timestamp: string;
}

// ═══════════════════════════════════════
// DASHBOARD / METRICS
// ═══════════════════════════════════════

export interface DashboardMetrics {
  activeAgents: number;
  totalToday: number;
  resolutionRate: number;
  escalationsToday: number;
  trends: {
    agents: number;
    conversations: number;
    resolution: number;
    escalations: number;
  };
}

// ═══════════════════════════════════════
// CONVERSATION / MESSAGE TYPES
// ═══════════════════════════════════════

export type ConversationStatus = 'active' | 'escalated' | 'closed';

export interface Conversation {
  id: string;
  agentId: string;
  externalId: string;         // ID da conversa no Talki/Chatwoot
  customerPhone: string;
  customerName?: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCallId?: string;         // preenchido quando role = 'tool'
  toolName?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheHit?: boolean;          // prompt cache hit (reduz custo em até 90%)
  createdAt: string;
}

// ═══════════════════════════════════════
// API RESPONSE WRAPPER
// ═══════════════════════════════════════

export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
  timestamp: string;
}

// ═══════════════════════════════════════
// TEST AGENT
// ═══════════════════════════════════════

export interface TestAgentPayload {
  agentId: string;
  phoneNumber: string;
  message: string;
}

export interface TestAgentResponse {
  response: string;
  toolsUsed: string[];
  tokensUsed: number;
  responseTime: number;
}
