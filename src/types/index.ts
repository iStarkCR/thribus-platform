// ═══════════════════════════════════════
// AGENT TYPES
// ═══════════════════════════════════════

export type AgentStatus = 'online' | 'standby' | 'offline';
export type AgentType = 'modular' | 'operacional' | 'enterprise';
export type AIModel =
  // Anthropic
  | 'claude-sonnet-4-20250514'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-6'
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
}

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
  stats: AgentStats;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════
// WORKSPACE (multi-tenant)
// ═══════════════════════════════════════

export type LLMProvider = 'openai' | 'anthropic';
export type CRMProvider = 'talki' | 'texnet';

export interface Workspace {
  id: string;
  name: string;
  llmProvider: LLMProvider;
  llmApiKey?: string;
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
