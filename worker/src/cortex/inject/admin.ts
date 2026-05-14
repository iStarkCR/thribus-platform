/**
 * Admin REST API — operações de manutenção da plataforma Cortex.
 *
 * Auth: header `X-Admin-Secret` deve bater com env `ADMIN_SECRET` (mesmo
 * mecanismo usado pelo /admin/reprocess-lead do worker legado).
 *
 * Endpoints (todos prefixados em /cortex/admin):
 *   POST   /tenants              → cria tenant
 *   GET    /tenants              → lista tenants
 *   GET    /tenants/:id          → busca por id ou slug
 *   PATCH  /tenants/:id          → atualiza plano/status/limites
 *   POST   /tenants/:id/api-keys → cria nova API key (retorna RAW só agora)
 *   GET    /tenants/:id/api-keys → lista keys (sem o raw — só prefix)
 *   POST   /api-keys/:id/revoke  → revoga
 *   GET    /tenants/:id/usage    → uso mensal (mês corrente)
 *   POST   /sessions/:id/consolidate → força consolidação on-demand
 *   POST   /knowledge            → adiciona doc ao RAG do tenant
 *   GET    /metrics              → snapshot completo (override sem auth tenant)
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { consolidateSessionById } from '../memory/consolidation.js';
import { semanticMemory } from '../memory/semantic.js';
import { snapshot as metricsSnapshot } from '../observability/metrics.js';
import { clearApiKeyCache, generateApiKey } from '../tenancy/store.js';
import { getMonthlyUsage } from '../guardrails/cost-limit.js';

function requireAdmin(req: Request, res: Response): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res
      .status(503)
      .json({ error: 'admin endpoints disabled — set ADMIN_SECRET env' });
    return false;
  }
  const provided = req.headers['x-admin-secret'];
  if (provided !== adminSecret) {
    res.status(401).json({ error: 'invalid admin secret' });
    return false;
  }
  return true;
}

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return false;
  }
  return true;
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // ─── Tenants ──────────────────────────────────────────────────────────
  router.post('/tenants', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const body = req.body as {
      name?: string;
      slug?: string;
      plan?: string;
      workspace_id?: string;
      monthly_message_limit?: number;
      monthly_cost_limit_usd?: number;
    };
    if (!body.name || !body.slug) {
      res.status(400).json({ error: 'name e slug obrigatórios' });
      return;
    }
    const { data, error } = await supabase!
      .from('cortex_tenants')
      .insert({
        name: body.name,
        slug: body.slug,
        plan: body.plan ?? 'starter',
        workspace_id: body.workspace_id ?? null,
        monthly_message_limit: body.monthly_message_limit ?? null,
        monthly_cost_limit_usd: body.monthly_cost_limit_usd ?? null,
      })
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ tenant: data });
  });

  router.get('/tenants', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from('cortex_tenants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ tenants: data });
  });

  router.get('/tenants/:idOrSlug', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const ref = req.params.idOrSlug;
    const { data, error } = await supabase!
      .from('cortex_tenants')
      .select('*')
      .or(`id.eq.${ref},slug.eq.${ref}`)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }
    res.json({ tenant: data });
  });

  router.patch('/tenants/:id', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const body = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    for (const k of [
      'name',
      'plan',
      'status',
      'workspace_id',
      'monthly_message_limit',
      'monthly_cost_limit_usd',
      'config',
    ]) {
      if (k in body) allowed[k] = body[k];
    }
    allowed.updated_at = new Date().toISOString();
    const { data, error } = await supabase!
      .from('cortex_tenants')
      .update(allowed)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ tenant: data });
  });

  // ─── API Keys ──────────────────────────────────────────────────────────
  router.post('/tenants/:id/api-keys', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const body = req.body as { name?: string; scopes?: string[]; env?: 'live' | 'test' };
    if (!body.name) {
      res.status(400).json({ error: 'name obrigatório' });
      return;
    }
    const generated = generateApiKey(body.env ?? 'live');
    const { data, error } = await supabase!
      .from('cortex_api_keys')
      .insert({
        tenant_id: req.params.id,
        key_hash: generated.hash,
        key_prefix: generated.prefix,
        name: body.name,
        scopes: body.scopes ?? ['analyze', 'stream', 'agents:read'],
      })
      .select('id, key_prefix, name, scopes, status, created_at')
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    clearApiKeyCache();
    res.json({
      key: data,
      raw: generated.raw, // ÚNICA chance de ver o raw
      warning: 'guarde essa key agora — não será exibida de novo',
    });
  });

  router.get('/tenants/:id/api-keys', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from('cortex_api_keys')
      .select('id, key_prefix, name, scopes, status, last_used_at, created_at, revoked_at')
      .eq('tenant_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ keys: data });
  });

  router.post('/api-keys/:id/revoke', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from('cortex_api_keys')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, key_prefix, status, revoked_at')
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    clearApiKeyCache();
    res.json({ key: data });
  });

  // ─── Usage ─────────────────────────────────────────────────────────────
  router.get('/tenants/:id/usage', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const usage = await getMonthlyUsage(req.params.id);
    res.json({ tenant_id: req.params.id, current_month: usage });
  });

  // ─── Consolidação on-demand ────────────────────────────────────────────
  router.post('/sessions/:id/consolidate', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body as { tenant_id?: string };
    if (!body.tenant_id) {
      res.status(400).json({ error: 'tenant_id obrigatório no body' });
      return;
    }
    const out = await consolidateSessionById(body.tenant_id, req.params.id);
    res.json(out);
  });

  // ─── Knowledge base (RAG) ──────────────────────────────────────────────
  router.post('/knowledge', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body as {
      tenant_id?: string;
      title?: string;
      text?: string;
      source?: string;
      tags?: string[];
      agent_scope?: string[];
    };
    if (!body.tenant_id || !body.text) {
      res.status(400).json({ error: 'tenant_id e text obrigatórios' });
      return;
    }
    const ok = await semanticMemory.addKnowledge(body.tenant_id, {
      title: body.title,
      text: body.text,
      source: body.source,
      tags: body.tags,
      agentScope: body.agent_scope,
    });
    if (!ok) {
      res.status(500).json({ error: 'add_knowledge_failed (Supabase off, OpenAI off, ou tabela ausente)' });
      return;
    }
    res.json({ ok: true });
  });

  // ─── Metrics (admin override — sem precisar de tenant) ─────────────────
  router.get('/metrics', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json(metricsSnapshot());
  });

  return router;
}
