/**
 * @thribus/cortex-sdk — cliente oficial pro Cortex Brain.
 *
 * Uso:
 *   import { CortexClient } from '@thribus/cortex-sdk';
 *
 *   const cortex = new CortexClient({
 *     baseUrl: 'https://cortex.thribus.com.br',
 *     apiKey: process.env.CORTEX_API_KEY!,
 *   });
 *
 *   const result = await cortex.analyze({
 *     sessionId: `customer-${customerId}-${Date.now()}`,
 *     input: 'Quero saber se tem internet na minha rua',
 *     entity: { type: 'customer', id: customerId, displayName: 'João' },
 *     channel: 'whatsapp',
 *   });
 *
 *   console.log(result.reply);              // texto pra mostrar pro usuário
 *   console.log(result.metrics.agentUsed);  // qual agente respondeu
 *   console.log(result.actions);            // ações tomadas/sugeridas
 *
 * Streaming:
 *   for await (const event of cortex.stream({...})) {
 *     console.log(event.type, event.data);
 *   }
 */

export interface CortexClientOptions {
  /** Base URL do worker (sem `/cortex` no fim). Ex: https://cortex.thribus.com.br */
  baseUrl: string;
  /** API key do tenant — formato `ck_live_…` ou `ck_test_…` */
  apiKey: string;
  /** Timeout em ms (default: 30000) */
  timeoutMs?: number;
  /** fetch customizado (útil pra mock em testes) */
  fetch?: typeof fetch;
}

export interface EntityRef {
  type: string;
  id: string;
  displayName?: string;
  attrs?: Record<string, unknown>;
}

export interface AnalyzeInput {
  sessionId: string;
  input: string;
  entity?: EntityRef;
  channel?: string;
  hints?: {
    forceAgent?: string;
    readonly?: boolean;
    maxLatencyMs?: number;
  };
  meta?: Record<string, unknown>;
}

export interface BrainAction {
  type: 'reply' | 'agent_call' | 'tool_call' | 'escalate' | 'noop';
  agent?: string;
  tool?: string;
  payload?: Record<string, unknown>;
  result?: unknown;
  riskLevel?: 0 | 1 | 2 | 3 | 4;
}

export interface BrainInsight {
  kind: 'observation' | 'prediction' | 'recommendation' | 'risk';
  text: string;
  confidence?: number;
}

export interface AnalyzeResult {
  sessionId: string;
  reply: string | null;
  actions: BrainAction[];
  insights: BrainInsight[];
  nextSteps?: string[];
  metrics: {
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
    agentUsed?: string;
    model?: string;
  };
  traceId: string;
}

export interface CortexAgent {
  id: string;
  name: string;
  category: string;
  description: string;
  intents: string[];
  version: string;
}

export interface StreamEvent {
  type:
    | 'started'
    | 'analyzer'
    | 'insight'
    | 'agent_start'
    | 'chunk'
    | 'agent_done'
    | 'action'
    | 'done'
    | 'error';
  data: unknown;
}

export class CortexError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'CortexError';
  }
}

export class CortexClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(opts: CortexClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl obrigatório');
    if (!opts.apiKey) throw new Error('apiKey obrigatório');
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis);
  }

  /** Analisa input e devolve resposta + ações consolidadas. */
  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    return this.request<AnalyzeResult>('POST', '/cortex/analyze', input);
  }

  /** Lista agentes disponíveis pro tenant. */
  async listAgents(): Promise<CortexAgent[]> {
    const data = await this.request<{ agents: CortexAgent[] }>(
      'GET',
      '/cortex/agents',
    );
    return data.agents;
  }

  /** Health check. */
  async health(): Promise<{
    service: string;
    status: string;
    agents: number;
    sessions: number;
    ts: string;
  }> {
    return this.request('GET', '/cortex/health');
  }

  /**
   * Streaming via SSE. Retorna um AsyncIterable de eventos.
   *
   * Cada event tem `type` (analyzer, insight, agent_start, chunk, done, error)
   * e `data` (payload do evento).
   */
  async *stream(input: AnalyzeInput): AsyncIterable<StreamEvent> {
    const url = `${this.baseUrl}/cortex/stream`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        throw new CortexError(resp.status, text || resp.statusText);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trimEnd();
          buffer = buffer.slice(nl + 1);

          if (line === '') {
            currentEvent = null;
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            try {
              const data = dataStr ? JSON.parse(dataStr) : null;
              yield {
                type: (currentEvent ?? 'message') as StreamEvent['type'],
                data,
              };
            } catch {
              yield {
                type: (currentEvent ?? 'message') as StreamEvent['type'],
                data: dataStr,
              };
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new CortexError(
          resp.status,
          (data as { error?: string; message?: string }).error ??
            (data as { message?: string }).message ??
            resp.statusText,
          data,
        );
      }
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
