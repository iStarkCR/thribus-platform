/**
 * Guardrails — entry point.
 *
 * Aplica ANTES da orquestração:
 *   1. Rate limit (rejeita 429)
 *   2. Cost limit mensal (rejeita 402)
 *   3. PII detection + masking opcional
 *
 * Fase 3 (este arquivo + módulos):
 *   4. Prompt injection detection (rejeita 400)
 *   5. Content filtering (rejeita 400)
 *   E na SAÍDA: output validation (validateAgentOutput) e validação de
 *   tool input contra schema (validateToolInput, usado no executor).
 */

import type { AnalyzeRequest, TenantContext } from '../types.js';
import { filterContent } from './content-filter.js';
import { checkCostLimit } from './cost-limit.js';
import { detectPii, maskPii } from './pii.js';
import { detectPromptInjection } from './prompt-injection.js';
import { checkRateLimit } from './rate-limit.js';

export interface GuardrailResult {
  allow: boolean;
  /** Request modificado (PII masked se aplicável). */
  req: AnalyzeRequest;
  reason?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

const MASK_PII_DEFAULT = process.env.CORTEX_PII_MASK !== 'false';
const INJECTION_BLOCK = process.env.CORTEX_INJECTION_BLOCK !== 'false';
const CONTENT_FILTER_BLOCK = process.env.CORTEX_CONTENT_FILTER !== 'false';

export async function applyGuardrails(
  tenant: TenantContext,
  req: AnalyzeRequest,
): Promise<GuardrailResult> {
  // 1. Rate limit
  const rl = checkRateLimit(tenant.tenantId);
  if (!rl.allowed) {
    return {
      allow: false,
      req,
      reason: 'rate_limited',
      statusCode: 429,
      details: { retry_after_ms: rl.retryAfterMs },
    };
  }

  // 2. Cost limit (só se tenant veio do DB com limites configurados)
  // Lookup leve só pros limites — usa cache do store
  try {
    // Não temos o raw key aqui — então pulamos a checagem se tenant.tenantId
    // não bater com cache. Pra Fase 2 ficamos com os limites do env vars
    // (poderia evoluir pra cache de tenant config). Aqui apenas chamamos
    // checkCostLimit sem limites — só pra agregar uso. Se quiser bloqueio
    // imediato, configurar CORTEX_COST_LIMIT_USD / CORTEX_MSG_LIMIT.
    const envMsgLimit = process.env.CORTEX_MSG_LIMIT
      ? Number(process.env.CORTEX_MSG_LIMIT)
      : undefined;
    const envCostLimit = process.env.CORTEX_COST_LIMIT_USD
      ? Number(process.env.CORTEX_COST_LIMIT_USD)
      : undefined;

    if (envMsgLimit || envCostLimit) {
      const status = await checkCostLimit(tenant.tenantId, envMsgLimit, envCostLimit);
      if (status.exceeded !== 'none') {
        return {
          allow: false,
          req,
          reason: `${status.exceeded}_limit_exceeded`,
          statusCode: 402,
          details: {
            month_messages: status.monthMessages,
            month_cost_usd: status.monthCostUsd,
          },
        };
      }
    }
  } catch (err) {
    console.warn('[cortex.guardrails] cost check falhou (continua):', (err as Error).message);
  }

  // 3. Prompt injection detection (sobre o input CRU, antes de mascarar)
  const injection = detectPromptInjection(req.input);
  if (injection.shouldBlock && INJECTION_BLOCK) {
    return {
      allow: false,
      req,
      reason: 'prompt_injection_detected',
      statusCode: 400,
      details: {
        score: injection.score,
        categories: [...new Set(injection.matches.map((m) => m.category))],
      },
    };
  }

  // 4. Content filtering
  const content = filterContent(req.input);
  if (content.flagged && CONTENT_FILTER_BLOCK) {
    return {
      allow: false,
      req,
      reason: 'content_policy_violation',
      statusCode: 400,
      details: { categories: content.categories },
    };
  }

  // 5. PII detection + masking opcional
  let processedInput = req.input;
  const piiMatches = detectPii(req.input);
  if (piiMatches.length > 0 && MASK_PII_DEFAULT) {
    processedInput = maskPii(req.input, piiMatches);
  }

  const details: Record<string, unknown> = {};
  if (piiMatches.length > 0) {
    details.pii_detected = piiMatches.length;
    details.pii_types = [...new Set(piiMatches.map((p) => p.type))];
  }
  // Injection/conteúdo flagrado mas não bloqueado (modo monitor) → vai pro audit
  if (injection.detected) {
    details.injection_score = injection.score;
    details.injection_categories = [...new Set(injection.matches.map((m) => m.category))];
  }
  if (content.flagged) details.content_flags = content.categories;

  return {
    allow: true,
    req: { ...req, input: processedInput },
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

export { recordUsage } from './cost-limit.js';
export { validateAgentOutput } from './output-validation.js';
export { validateToolInput } from './tool-input.js';
