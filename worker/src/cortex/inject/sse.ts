/**
 * SSE (Server-Sent Events) streaming pro Cortex.
 *
 * Endpoint: POST /cortex/stream
 *
 * Diferente do /analyze (request/response), o /stream emite eventos
 * em ordem conforme o Brain processa:
 *
 *   event: started      → request aceita, trace_id atribuído
 *   event: analyzer     → analyzer terminou (intent + selected_agent)
 *   event: insight      → cada insight do Brain
 *   event: agent_start  → agente começou a processar
 *   event: chunk        → pedaço de texto da resposta (Fase 2 com streaming nativo do LLM)
 *   event: agent_done   → agente terminou
 *   event: handoff      → transferência entre agentes
 *   event: action       → ação tomada/sugerida
 *   event: done         → fim do request com metrics finais
 *   event: error        → erro fatal
 *
 * Fase 1: emite eventos baseado nas etapas do orchestrator atual (não tem
 * streaming token-a-token do LLM ainda — chunk emite resposta completa).
 *
 * Fase 2: integrar com Anthropic streaming SDK pra emitir chunks reais.
 */

import express, { type Request, type Response, Router } from 'express';
import { orchestrate } from '../brain/orchestrator.js';
import { applyGuardrails } from '../guardrails/index.js';
import type { AnalyzeRequest, EntityRef } from '../types.js';
import { authenticate, resolveAnthropicKey } from './auth.js';

function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function validateBody(body: unknown):
  | { ok: true; req: AnalyzeRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body inválido' };
  const b = body as Record<string, unknown>;
  if (typeof b.sessionId !== 'string' || !b.sessionId.trim())
    return { ok: false, error: 'sessionId obrigatório' };
  if (typeof b.input !== 'string' || !b.input.trim())
    return { ok: false, error: 'input obrigatório' };

  let entity: EntityRef | undefined;
  if (b.entity && typeof b.entity === 'object') {
    const e = b.entity as Record<string, unknown>;
    if (typeof e.type === 'string' && typeof e.id === 'string') {
      entity = {
        type: e.type,
        id: e.id,
        displayName: typeof e.displayName === 'string' ? e.displayName : undefined,
        attrs:
          e.attrs && typeof e.attrs === 'object' && !Array.isArray(e.attrs)
            ? (e.attrs as Record<string, unknown>)
            : undefined,
      };
    }
  }

  return {
    ok: true,
    req: {
      sessionId: b.sessionId.trim(),
      input: b.input.trim(),
      channel: typeof b.channel === 'string' ? b.channel : undefined,
      entity,
      hints: (b.hints as AnalyzeRequest['hints']) ?? undefined,
      meta:
        b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)
          ? (b.meta as Record<string, unknown>)
          : undefined,
    },
  };
}

export function createStreamRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  router.post('/stream', async (req: Request, res: Response) => {
    const tenant = await authenticate(req.headers.authorization as string | undefined);
    if (!tenant) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const v = validateBody(req.body);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    // Guardrails (rate, cost, injection, content, PII) — paridade com /analyze
    const guard = await applyGuardrails(tenant, v.req);
    if (!guard.allow) {
      res.status(guard.statusCode ?? 429).json({
        error: guard.reason,
        details: guard.details,
      });
      return;
    }
    const analyzeReq = guard.req;

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desabilita buffering em nginx
    res.flushHeaders?.();

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    writeEvent(res, 'started', { sessionId: analyzeReq.sessionId, ts: new Date().toISOString() });

    try {
      const apiKey = resolveAnthropicKey(tenant);
      const result = await orchestrate(tenant, analyzeReq, apiKey);

      if (aborted) {
        res.end();
        return;
      }

      // Emite breakdown dos resultados como stream de eventos
      writeEvent(res, 'analyzer', {
        intent: result.actions.find((a) => a.type === 'agent_call' || a.type === 'reply')
          ? 'classified'
          : 'unknown',
        agentUsed: result.metrics.agentUsed,
        traceId: result.traceId,
      });

      for (const insight of result.insights) {
        if (aborted) break;
        writeEvent(res, 'insight', insight);
      }

      for (const action of result.actions) {
        if (aborted) break;
        if (action.type === 'agent_call') {
          writeEvent(res, 'agent_start', {
            agent: action.agent,
            hop: action.payload?.hop ?? 0,
          });
        } else if (action.type === 'tool_call') {
          writeEvent(res, 'action', action);
        }
      }

      if (result.reply) {
        // Fase 1: emite reply completo como 1 chunk; Fase 2 vai virar streaming real
        writeEvent(res, 'chunk', { text: result.reply });
      }

      writeEvent(res, 'done', {
        reply: result.reply,
        actions: result.actions,
        metrics: result.metrics,
        traceId: result.traceId,
      });

      res.end();
    } catch (err) {
      const msg = (err as Error).message;
      writeEvent(res, 'error', { message: msg });
      res.end();
    }
  });

  return router;
}
