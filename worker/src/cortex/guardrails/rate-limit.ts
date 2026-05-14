/**
 * Rate limiter — token bucket por tenant.
 *
 * Fase 2: in-memory (single instance).
 * Fase 3: Redis-backed pra multi-instance.
 *
 * Defaults: 60 req/min por tenant. Configurável por env CORTEX_RATE_LIMIT_RPM.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillPerSec: number;
}

const RPM = Number(process.env.CORTEX_RATE_LIMIT_RPM ?? 60);
const DEFAULT_CAPACITY = RPM;
const DEFAULT_REFILL_PER_SEC = RPM / 60;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(tenantId: string): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(tenantId);
  if (!b) {
    b = {
      tokens: DEFAULT_CAPACITY,
      lastRefill: now,
      capacity: DEFAULT_CAPACITY,
      refillPerSec: DEFAULT_REFILL_PER_SEC,
    };
    buckets.set(tenantId, b);
  }

  // Refill proporcional ao tempo passado
  const elapsedSec = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(b.capacity, b.tokens + elapsedSec * b.refillPerSec);
  b.lastRefill = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: Math.floor(b.tokens) };
  }

  const needed = 1 - b.tokens;
  const retryAfterMs = Math.ceil((needed / b.refillPerSec) * 1000);
  return { allowed: false, remaining: 0, retryAfterMs };
}

/** Override de capacidade por tenant (Fase 3: vem do plano do tenant). */
export function setTenantLimit(
  tenantId: string,
  rpm: number,
): void {
  const cap = Math.max(1, rpm);
  buckets.set(tenantId, {
    tokens: cap,
    lastRefill: Date.now(),
    capacity: cap,
    refillPerSec: cap / 60,
  });
}
