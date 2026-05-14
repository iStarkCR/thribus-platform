/**
 * Cortex Brain — tipos públicos
 *
 * Toda integração externa (sistemas de cliente, SDK, painel) fala
 * com o Brain através desses tipos. Internamente o Brain traduz pra
 * formatos específicos (LLM, agente, memória).
 */

/** Contexto do tenant (cliente da plataforma Cortex). */
export interface TenantContext {
  /** ID do tenant — derivado da API key. */
  tenantId: string;
  /** Nome humano (pra logs). */
  tenantName?: string;
  /** Workspace_id correspondente no DB de agentes/bianca legacy. */
  workspaceId?: string;
}

/** Entidade sobre quem o Brain está raciocinando (cliente final do tenant). */
export interface EntityRef {
  /** Tipo de entidade — customer | lead | account | user… */
  type: string;
  /** ID estável no sistema externo do tenant. */
  id: string;
  /** Display name (não usado pra lookup, só apresentação). */
  displayName?: string;
  /** Atributos arbitrários do sistema externo (passa direto pro prompt). */
  attrs?: Record<string, unknown>;
}

/** Mensagem dentro de uma sessão Cortex. */
export interface CortexMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Metadados livres (channel, source, etc). */
  meta?: Record<string, unknown>;
  ts?: string;
}

/** Request de entrada do inject layer. */
export interface AnalyzeRequest {
  /** ID da sessão (caller-provided). Mesma sessionId → mesma memória curta. */
  sessionId: string;
  /** Entidade alvo do raciocínio. */
  entity?: EntityRef;
  /** Texto da mensagem ou query do sistema externo. */
  input: string;
  /** Channel de origem — webchat | whatsapp | crm | api… (livre). */
  channel?: string;
  /** Hints opcionais do sistema externo (forçar agent, modo readonly, etc). */
  hints?: {
    forceAgent?: string;
    readonly?: boolean;
    maxLatencyMs?: number;
  };
  /** Metadados livres do caller. */
  meta?: Record<string, unknown>;
}

/** Ação tomada/sugerida pelo Brain. */
export interface BrainAction {
  /** Nome simbólico — 'reply', 'agent_call', 'tool_call', 'escalate'. */
  type: 'reply' | 'agent_call' | 'tool_call' | 'escalate' | 'noop';
  /** Agente acionado (se type=agent_call). */
  agent?: string;
  /** Tool acionada (se type=tool_call). */
  tool?: string;
  /** Payload da ação. */
  payload?: Record<string, unknown>;
  /** Resultado (preenchido após execução). */
  result?: unknown;
  /** Nível de risco (0..4) — usado pra decidir aprovação. */
  riskLevel?: 0 | 1 | 2 | 3 | 4;
}

/** Insight gerado pelo Brain sobre a entidade/situação. */
export interface BrainInsight {
  kind: 'observation' | 'prediction' | 'recommendation' | 'risk';
  text: string;
  /** Confiança do Brain (0..1). */
  confidence?: number;
}

/** Response do inject layer. */
export interface AnalyzeResponse {
  sessionId: string;
  /** Resposta textual consolidada pelo Brain (pode ser null se só houve ações). */
  reply: string | null;
  /** Ações tomadas (autônomas) ou sugeridas (aprovação pendente). */
  actions: BrainAction[];
  /** Insights extraídos do contexto + memória. */
  insights: BrainInsight[];
  /** Próximos passos sugeridos. */
  nextSteps?: string[];
  /** Metadados: latência, tokens, custo, agente que respondeu. */
  metrics: {
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
    agentUsed?: string;
    model?: string;
  };
  /** Trace ID — pra debug/audit. */
  traceId: string;
}

/** Sessão em memória curta (Redis depois). */
export interface CortexSession {
  sessionId: string;
  tenantId: string;
  entity?: EntityRef;
  channel?: string;
  messages: CortexMessage[];
  /** Última ação tomada — útil pro próximo turno. */
  lastAction?: BrainAction;
  createdAt: string;
  updatedAt: string;
}
