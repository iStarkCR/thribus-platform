/**
 * Definição de um agente registrado no Brain.
 *
 * Um AgentDefinition é a parte estática (prompt, ferramentas, modelo).
 * O AgentRuntime é o executor — recebe a definição + input e retorna output.
 */

import type { ToolDefinition } from '../../llm/types.js';

/** Categoria semântica do agente — usada pelo router pra match de intent. */
export type AgentCategory =
  | 'sales'
  | 'support'
  | 'finance'
  | 'retention'
  | 'hr'
  | 'ops'
  | 'generic';

export interface AgentDefinition {
  /** ID único — usado por router/inject/audit. */
  id: string;
  /** Nome humano (Bianca, Renata, Marcos…). */
  name: string;
  /** Categoria do agente. */
  category: AgentCategory;
  /** Descrição curta — usada pelo router pra escolher. */
  description: string;
  /** Frases/intenções típicas em que esse agente atua. */
  intents: string[];
  /** Modelo padrão. Pode ser sobrescrito por tenant. */
  model: string;
  /** System prompt base. */
  systemPrompt: string;
  /** Tools que esse agente pode chamar (nome simbólico). */
  tools: ToolDefinition[];
  /** Se true, agente pode produzir ações autônomas. */
  autonomous?: boolean;
  /** Nível máximo de risco autorizado sem aprovação humana (0-4). */
  maxAutonomousRiskLevel?: 0 | 1 | 2 | 3 | 4;
  /** Versão semântica do agente — pra evoluir sem quebrar. */
  version: string;
  /**
   * Bridge para agente legacy no DB (M1/M2): se definido, tools desconhecidas
   * são executadas via dispatcher legado com esse agentId. Permite reusar
   * tools IXC/TexNet/Geogrid da Bianca atual sem reimplementar.
   * Resolvido em runtime via env BIANCA_LEGACY_AGENT_ID ou config do tenant.
   */
  legacyAgentIdEnvVar?: string;
  /** Máximo de iterações no loop de tool execution. Default: 5. */
  maxToolIterations?: number;
  /** Roteamento de modelo por complexidade (opcional). Se ausente, usa `model` fixo. */
  modelTiers?: { trivial: string; standard: string; complex: string };
}

/** Input do runtime de um agente. */
export interface AgentRunInput {
  tenantId: string;
  sessionId: string;
  /** Mensagens da conversa (já vindas do shortTermMemory). */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Contexto adicional injetado pelo Brain (insights, entity, etc). */
  brainContext?: string;
  /** API key específica do tenant (sobrescreve env). */
  apiKey?: string;
}

/** Output do runtime — o Brain consolida. */
export interface AgentRunOutput {
  agentId: string;
  text: string | null;
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
  stopReason: string;
}
