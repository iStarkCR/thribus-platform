// ═══════════════════════════════════════
// AGENT TYPES
// ═══════════════════════════════════════

export type AgentStatus = 'online' | 'standby' | 'offline';
export type AgentType = 'modular' | 'operacional' | 'enterprise';
export type AIModel = 'claude-sonnet-4-20250514' | 'claude-haiku-4-5-20251001' | 'claude-opus-4-6';

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
  stats: AgentStats;
  createdAt: string;
  updatedAt: string;
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
}

// ═══════════════════════════════════════
// TOOL TYPES
// ═══════════════════════════════════════

export interface Tool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  scope: string;        // client name or "global"
  active: boolean;
  parameters?: ToolParameter[];
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
  cost: number;            // USD
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
