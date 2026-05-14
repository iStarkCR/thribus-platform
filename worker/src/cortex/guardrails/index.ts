/**
 * Guardrails — entry point.
 *
 * Aplica ANTES da orquestração:
 *   1. Rate limit (rejeita 429)
 *   2. Cost limit mensal (rejeita 402)
 *   3. PII detection + masking opcional
 *
 * Fase 2: cobertura básica. Fase 3: prompt injection detection,
 * content filtering, output validation.
 */

import type { AnalyzeRequest, TenantContext } from '../types.js';
import { checkCostLimit } from './cost-limit.js';
import { detectPii, maskPii } from './pii.js';
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

  // 3. PII detection + masking opcional
  let processedInput = req.input;
  const piiMatches = detectPii(req.input);
  if (piiMatches.length > 0 && MASK_PII_DEFAULT) {
    processedInput = maskPii(req.input, piiMatches);
  }

  return {
    allow: true,
    req: { ...req, input: processedInput },
    details: piiMatches.length > 0
      ? { pii_detected: piiMatches.length, pii_types: [...new Set(piiMatches.map((p) => p.type))] }
      : undefined,
  };
}

export { recordUsage } from './cost-limit.js';
