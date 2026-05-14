/**
 * Brain Analyzer — primeiro estágio do Brain.
 *
 * Recebe input do tenant + memória curta + entity context → decide:
 *  1. Qual agente ativar (ou nenhum, se Brain consegue responder direto)
 *  2. Intent classificada
 *  3. Insights iniciais sobre o contexto
 *
 * Modelo: Haiku por padrão (rápido + barato).
 * Em fases futuras: se confiança < threshold, escala pra Sonnet.
 */

import { callLLM } from '../../llm/client.js';
import type { ToolDefinition } from '../../llm/types.js';
import { agentRegistry } from '../agents/registry.js';
import type { AnalyzeRequest, BrainInsight, CortexSession } from '../types.js';

export interface AnalyzerOutput {
  /** Agente selecionado (ou null se o Brain responde direto). */
  selectedAgentId: string | null;
  /** Intent classificada (livre — descritivo). */
  intent: string;
  /** Confiança da classificação (0..1). */
  confidence: number;
  /** Raciocínio do Brain — útil pra audit/debug. */
  reasoning: string;
  /** Insights iniciais extraídos do contexto. */
  insights: BrainInsight[];
  /** Resposta direta — preenchido se selectedAgentId=null. */
  directReply?: string;
  /** Métricas de uso do analyzer (tokens, custo). */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
  model: string;
}

const ANALYZER_MODEL = process.env.CORTEX_ANALYZER_MODEL || 'claude-haiku-4-5-20251001';

const ANALYZE_TOOL: ToolDefinition = {
  name: 'classify_and_route',
  description:
    'Classifica o input do usuário, decide qual agente atender (ou Brain responde direto) e extrai insights iniciais.',
  input_schema: {
    type: 'object',
    properties: {
      selected_agent_id: {
        type: 'string',
        description:
          'ID do agente que deve atender. Use "none" se o Brain pode responder direto sem precisar de agente especialista.',
      },
      intent: {
        type: 'string',
        description: 'Intent classificada em 1-5 palavras (ex: "consultar viabilidade", "reclamar cobrança").',
      },
      confidence: {
        type: 'number',
        description: 'Confiança da classificação de 0 a 1.',
      },
      reasoning: {
        type: 'string',
        description: 'Por que escolheu esse agente/rota. Máx 200 chars.',
      },
      insights: {
        type: 'array',
        description: 'Lista de até 3 insights sobre o contexto (observações, riscos, recomendações).',
      },
      direct_reply: {
        type: 'string',
        description:
          'Se selected_agent_id="none", resposta direta que o Brain deve dar. Senão deixar vazio.',
      },
    },
    required: ['selected_agent_id', 'intent', 'confidence', 'reasoning'],
  },
};

function buildSystemPrompt(): string {
  return `Você é o Cortex Brain — o cérebro orquestrador de uma plataforma multi-agente B2B.

Sua função é analisar o input do usuário e decidir:
1. Qual agente especialista deve atender (ou responder direto se for trivial)
2. Qual a intent por trás da mensagem
3. Quais insights/observações são relevantes

AGENTES DISPONÍVEIS:
${agentRegistry.describeAll()}

REGRAS:
- Use SEMPRE a tool "classify_and_route" — nunca responda em texto puro.
- Se for cumprimento simples ("oi", "tudo bem?"), pode responder direto (selected_agent_id="none").
- Se for ambíguo, escolha o agente mais provável e marque confidence baixa (< 0.6).
- Insights devem ser FACTUAIS sobre o contexto, não invenções.
- Seja conciso. reasoning ≤ 200 chars. insights ≤ 3 items.`;
}

function buildUserMessage(req: AnalyzeRequest, session: CortexSession): string {
  const parts: string[] = [];

  if (req.entity) {
    parts.push(
      `[ENTIDADE] ${req.entity.type}#${req.entity.id}${
        req.entity.displayName ? ` (${req.entity.displayName})` : ''
      }`,
    );
    if (req.entity.attrs && Object.keys(req.entity.attrs).length > 0) {
      parts.push(`[ATRIBUTOS] ${JSON.stringify(req.entity.attrs).slice(0, 500)}`);
    }
  }

  if (req.channel) {
    parts.push(`[CANAL] ${req.channel}`);
  }

  if (session.messages.length > 0) {
    const recent = session.messages.slice(-6);
    parts.push(
      `[HISTÓRICO RECENTE]\n${recent
        .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
        .join('\n')}`,
    );
  }

  parts.push(`[INPUT ATUAL]\n${req.input}`);

  if (req.hints?.forceAgent) {
    parts.push(`[HINT] Caller sugeriu agent="${req.hints.forceAgent}".`);
  }

  return parts.join('\n\n');
}

export async function analyze(
  req: AnalyzeRequest,
  session: CortexSession,
  apiKey?: string,
): Promise<AnalyzerOutput> {
  const response = await callLLM({
    model: ANALYZER_MODEL,
    systemPrompt: buildSystemPrompt(),
    tools: [ANALYZE_TOOL],
    messages: [{ role: 'user', content: buildUserMessage(req, session) }],
    apiKey,
    forceToolName: 'classify_and_route',
  });

  const toolCall = response.toolCalls[0];
  if (!toolCall) {
    // Defesa: se LLM falhou em chamar a tool, devolve fallback genérico
    const firstAgent = agentRegistry.list()[0];
    return {
      selectedAgentId: firstAgent?.id ?? null,
      intent: 'unknown',
      confidence: 0,
      reasoning: 'analyzer_no_tool_call_fallback',
      insights: [],
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cacheReadTokens: response.usage.cacheReadTokens,
      },
      model: ANALYZER_MODEL,
    };
  }

  const input = toolCall.input as {
    selected_agent_id: string;
    intent: string;
    confidence: number;
    reasoning: string;
    insights?: Array<{ kind?: string; text: string; confidence?: number }> | string[];
    direct_reply?: string;
  };

  const rawAgentId = (input.selected_agent_id ?? '').trim();
  const selectedAgentId =
    rawAgentId === 'none' || rawAgentId === '' ? null : rawAgentId;

  // Normaliza insights — aceita string[] ou Array<{kind, text, confidence}>
  const normalizedInsights: BrainInsight[] = [];
  if (Array.isArray(input.insights)) {
    for (const item of input.insights) {
      if (typeof item === 'string') {
        normalizedInsights.push({ kind: 'observation', text: item });
      } else if (item && typeof item === 'object' && 'text' in item) {
        normalizedInsights.push({
          kind: (item.kind as BrainInsight['kind']) ?? 'observation',
          text: String(item.text),
          confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
        });
      }
    }
  }

  return {
    selectedAgentId,
    intent: input.intent ?? 'unknown',
    confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
    reasoning: (input.reasoning ?? '').slice(0, 300),
    insights: normalizedInsights.slice(0, 5),
    directReply: selectedAgentId === null ? input.direct_reply : undefined,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheReadTokens: response.usage.cacheReadTokens,
    },
    model: ANALYZER_MODEL,
  };
}
