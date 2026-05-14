/**
 * Inject Layer — REST API do Cortex Brain.
 *
 * Endpoints:
 *   POST /cortex/analyze   → analisa input, roteia agente, devolve reply+actions
 *   POST /cortex/stream    → streaming SSE (mount em sse.ts)
 *   GET  /cortex/health    → status do Brain (uptime, agentes, sessões)
 *   GET  /cortex/agents    → lista de agentes disponíveis
 *
 * Auth: header `Authorization: Bearer <api_key>`
 *   - Fase 2: DB lookup em cortex_api_keys (com cache)
 *   - Fase 0 fallback: env var CORTEX_API_KEYS
 *   - Dev fallback: tenant="dev" se nada configurado
 */

import express, { type Request, type Response, Router } from 'express';
import { agentRegistry } from '../agents/registry.js';
import { orchestrate } from '../brain/orchestrator.js';
import { applyGuardrails } from '../guardrails/index.js';
import { shortTermMemory } from '../memory/short-term.js';
import { snapshot as metricsSnapshot } from '../observability/metrics.js';
import { createAdminRouter } from './admin.js';
import { createSsoRouter } from '../auth/sso.js';
import { createBillingRouter } from '../billing/stripe.js';
import { moduleRegistry } from '../modules/registry.js';
import type { AnalyzeRequest, EntityRef } from '../types.js';
import { authenticate, resolveAnthropicKey } from './auth.js';
import { createStreamRouter } from './sse.js';

function validateAnalyzeBody(
  body: unknown,
): { ok: true; req: AnalyzeRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body deve ser objeto JSON' };
  }
  const b = body as Record<string, unknown>;

  const sessionId = typeof b.sessionId === 'string' ? b.sessionId.trim() : '';
  if (!sessionId) return { ok: false, error: 'sessionId obrigatório (string)' };
  if (sessionId.length > 200) return { ok: false, error: 'sessionId muito longo' };

  const input = typeof b.input === 'string' ? b.input.trim() : '';
  if (!input) return { ok: false, error: 'input obrigatório (string)' };
  if (input.length > 16000) return { ok: false, error: 'input excede 16000 chars' };

  const channel = typeof b.channel === 'string' ? b.channel.slice(0, 50) : undefined;

  let entity: EntityRef | undefined;
  if (b.entity && typeof b.entity === 'object') {
    const e = b.entity as Record<string, unknown>;
    if (typeof e.type !== 'string' || typeof e.id !== 'string') {
      return { ok: false, error: 'entity.type e entity.id são obrigatórios (string)' };
    }
    entity = {
      type: e.type.slice(0, 50),
      id: e.id.slice(0, 200),
      displayName:
        typeof e.displayName === 'string' ? e.displayName.slice(0, 200) : undefined,
      attrs:
        e.attrs && typeof e.attrs === 'object' && !Array.isArray(e.attrs)
          ? (e.attrs as Record<string, unknown>)
          : undefined,
    };
  }

  const hints =
    b.hints && typeof b.hints === 'object'
      ? (b.hints as AnalyzeRequest['hints'])
      : undefined;

  const meta =
    b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)
      ? (b.meta as Record<string, unknown>)
      : undefined;

  return {
    ok: true,
    req: { sessionId, input, channel, entity, hints, meta },
  };
}

export function createCortexRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // Admin endpoints (gated por ADMIN_SECRET)
  router.use('/admin', createAdminRouter());

  // Auth/SSO (signup/signin/me)
  router.use('/auth', createSsoRouter());

  // Billing/Stripe (checkout, portal, webhook)
  router.use('/billing', createBillingRouter());

  // Enterprise modules (contracts, proposals, talki, bi)
  router.use('/modules', moduleRegistry.buildAllRoutes());

  // Catálogo público de módulos
  router.get('/modules', (_req: Request, res: Response) => {
    res.json({
      modules: moduleRegistry.list().map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        description: m.description,
        category: m.category,
        version: m.version,
        status: m.status,
        icon: m.icon,
        tags: m.tags ?? [],
        has_runtime: !!m.buildRouter,
      })),
    });
  });

  // SSE streaming
  router.use('/', createStreamRouter());

  router.get('/health', (_req, res) => {
    res.json({
      service: 'cortex-brain',
      status: 'ok',
      agents: agentRegistry.list().length,
      sessions: shortTermMemory.stats().totalSessions,
      ts: new Date().toISOString(),
    });
  });

  router.get('/metrics', async (req: Request, res: Response) => {
    const tenant = await authenticate(req.headers.authorization as string | undefined);
    if (!tenant) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(metricsSnapshot());
  });

  router.get('/agents', async (req: Request, res: Response) => {
    const tenant = await authenticate(req.headers.authorization as string | undefined);
    if (!tenant) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({
      agents: agentRegistry.list().map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        description: a.description,
        intents: a.intents,
        version: a.version,
      })),
    });
  });

  router.post('/analyze', async (req: Request, res: Response) => {
    const tenant = await authenticate(req.headers.authorization as string | undefined);
    if (!tenant) {
      res
        .status(401)
        .json({ error: 'unauthorized — header Authorization: Bearer <key>' });
      return;
    }

    const v = validateAnalyzeBody(req.body);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    // Guardrails (rate, cost, PII detection)
    const guard = await applyGuardrails(tenant, v.req);
    if (!guard.allow) {
      res.status(guard.statusCode ?? 429).json({
        error: guard.reason,
        details: guard.details,
      });
      return;
    }

    try {
      const apiKey = resolveAnthropicKey(tenant);
      const result = await orchestrate(tenant, guard.req, apiKey);
      res.setHeader('X-Trace-Id', result.traceId);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[cortex.inject] erro orchestrate:', msg);
      res.status(500).json({ error: 'internal_error', message: msg });
    }
  });

  return router;
}
