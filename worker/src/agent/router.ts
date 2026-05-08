/**
 * Multi-agent Router (M2)
 *
 * Quando um workspace tem `router_config.enabled = true`, a 1ª mensagem
 * de uma conversa nova é classificada por um LLM "leve" (gpt-4o-mini ou
 * haiku) que decide qual intent ela corresponde, e o worker direciona
 * pro agente certo do workspace.
 *
 * Em seguida, durante a conversa, agentes podem chamar
 * `transferir_para_agente` (internal tool) pra repassar contexto sem
 * passar pelo roteador de novo.
 *
 * Custo extra por roteamento: ~200-500 tokens × pricing do modelo escolhido
 * (~US$ 0.0001 por classificação com gpt-4o-mini). Negligível.
 */

import { callLLM } from '../llm/client.js';
import type { RouterConfig } from '../db/index.js';

export interface RouteDecision {
  intent: string;
  targetAgentId: string;
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Classifica a mensagem do user e decide qual agente atende.
 *
 * Retorna `null` se:
 *  - workspace não tem router_config ou router não está enabled
 *  - intents vazio (config inválida)
 *  - LLM não consegue classificar — usa fallback_agent_id se houver
 *
 * Em caso de erro de LLM ou intent não mapeada, retorna fallback se houver.
 */
export async function routeMessage(
  userMessage: string,
  routerConfig: RouterConfig | undefined,
  workspaceLlmApiKey?: string,
): Promise<RouteDecision | null> {
  if (!routerConfig || !routerConfig.enabled) return null;

  const intents = Object.keys(routerConfig.intents ?? {});
  if (intents.length === 0) return null;

  const fallbackAgentId = routerConfig.fallback_agent_id;
  const fallback = (reason: string): RouteDecision | null => {
    if (!fallbackAgentId) return null;
    return {
      intent: 'fallback',
      targetAgentId: fallbackAgentId,
      confidence: 0,
      reasoning: reason,
    };
  };

  // Prompt de classificação
  const intentList = intents.map((i) => `- ${i}`).join('\n');
  const systemPrompt =
    routerConfig.router_prompt ||
    'Você é um classificador de intenção. Classifique a mensagem do cliente em UMA das categorias abaixo.';

  const fullSystem =
    `${systemPrompt}\n\n` +
    `Categorias disponíveis:\n${intentList}\n\n` +
    `IMPORTANTE: Responda APENAS com o nome da categoria, em minúsculo, sem explicação. ` +
    `Se nenhuma categoria for clara, responda "_nenhuma_".`;

  const model = routerConfig.model || 'gpt-4o-mini';

  try {
    const response = await callLLM({
      model,
      systemPrompt: fullSystem,
      messages: [{ role: 'user', content: userMessage }],
      tools: [],
      apiKey: workspaceLlmApiKey,
    });

    // Texto livre da resposta
    const rawText = (response.text ?? '').trim().toLowerCase();

    if (!rawText) {
      console.warn('[router] LLM retornou vazio — usando fallback');
      return fallback('LLM_empty_response');
    }

    // Acha primeira intent que aparece no texto retornado (defensivo)
    const matched = intents.find((i) => rawText.includes(i));
    if (!matched) {
      console.warn(`[router] intent não reconhecida no texto="${rawText.slice(0, 50)}" — fallback`);
      return fallback(`unrecognized_intent="${rawText.slice(0, 50)}"`);
    }

    const targetAgentId = routerConfig.intents[matched];
    if (!targetAgentId) {
      console.warn(`[router] intent="${matched}" sem agent_id no mapping — fallback`);
      return fallback(`unmapped_intent=${matched}`);
    }

    return {
      intent: matched,
      targetAgentId,
      confidence: rawText === matched ? 1 : 0.7, // exato vs contém
      reasoning: `LLM classificou como "${matched}"`,
    };
  } catch (err) {
    console.error('[router] erro no classificador:', (err as Error).message);
    return fallback(`classifier_error: ${(err as Error).message}`);
  }
}
