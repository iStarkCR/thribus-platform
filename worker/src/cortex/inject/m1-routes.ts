/**
 * Cortex M1 — Routes consolidadas: workflows, approvals, webhooks, templates,
 * notifications. Todas em /cortex/m1/* sob admin auth.
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { listPending as listPendingApprovals, decide as decideApproval } from '../approvals/service.js';
import { listInApp, markRead } from '../notifications/service.js';
import { AGENT_TEMPLATES, seedTemplates } from '../templates/seed.js';
import { generateWebhookSecret } from '../webhooks/outgoing.js';
import { runWorkflow, type WorkflowDef } from '../workflows/engine.js';
import { verifyJwt } from '../auth/sso.js';

function requireAdmin(req: Request, res: Response): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: 'admin endpoints disabled' });
    return false;
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    res.status(401).json({ error: 'invalid admin secret' });
    return false;
  }
  return true;
}

function requireSb(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return false;
  }
  return true;
}

function getUserFromJwt(req: Request): { userId: string; email: string } | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  const p = verifyJwt(token);
  if (!p) return null;
  return { userId: p.sub, email: p.email };
}

export function createM1Router(): Router {
  const router = Router();
  router.use(express.json({ limit: '1mb' }));

  // ─── Templates de agente ──────────────────────────────────────────────
  router.get('/templates', async (_req: Request, res: Response) => {
    if (!supabase) {
      // Sem supabase, devolve os seeds in-memory
      res.json({ templates: AGENT_TEMPLATES });
      return;
    }
    const { data } = await supabase
      .from('cortex_agent_templates')
      .select('*')
      .order('install_count', { ascending: false });
    res.json({ templates: data ?? AGENT_TEMPLATES });
  });

  router.post('/templates/seed', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const result = await seedTemplates(supabase!);
    res.json(result);
  });

  router.post('/templates/:slug/install', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const body = req.body as { tenant_id?: string; agent_id?: string; display_name?: string };
    if (!body.tenant_id || !body.agent_id) {
      res.status(400).json({ error: 'tenant_id + agent_id obrigatórios' });
      return;
    }
    const { data: tpl } = await supabase!
      .from('cortex_agent_templates')
      .select('*')
      .eq('slug', req.params.slug)
      .maybeSingle();
    if (!tpl) {
      res.status(404).json({ error: 'template_not_found' });
      return;
    }
    const { data, error } = await supabase!
      .from('cortex_tenant_agents')
      .upsert(
        {
          tenant_id: body.tenant_id,
          agent_id: body.agent_id,
          template_id: tpl.id,
          display_name: body.display_name ?? tpl.name,
          system_prompt: tpl.system_prompt,
          model: tpl.model_default,
          enabled: true,
        },
        { onConflict: 'tenant_id,agent_id' },
      )
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    // incrementa install_count
    await supabase!
      .from('cortex_agent_templates')
      .update({ install_count: (tpl.install_count as number) + 1 })
      .eq('id', tpl.id);
    res.status(201).json({ tenant_agent: data });
  });

  // ─── Workflows ────────────────────────────────────────────────────────
  router.get('/workflows', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : undefined;
    if (!tenantId) {
      res.status(400).json({ error: 'tenant_id obrigatório (?tenant_id=)' });
      return;
    }
    const { data } = await supabase!
      .from('cortex_workflows')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    res.json({ workflows: data });
  });

  router.post('/workflows', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const body = req.body as Partial<WorkflowDef>;
    if (!body.tenant_id || !body.name || !body.trigger_type) {
      res.status(400).json({ error: 'tenant_id, name, trigger_type obrigatórios' });
      return;
    }
    const { data, error } = await supabase!
      .from('cortex_workflows')
      .insert({
        tenant_id: body.tenant_id,
        name: body.name,
        description: body.description ?? null,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config ?? {},
        steps: body.steps ?? [],
        enabled: body.enabled ?? true,
      })
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ workflow: data });
  });

  router.post('/workflows/:id/run', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { data: wf, error } = await supabase!
      .from('cortex_workflows')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error || !wf) {
      res.status(404).json({ error: 'workflow_not_found' });
      return;
    }
    try {
      const result = await runWorkflow(wf as unknown as WorkflowDef, (req.body as Record<string, unknown>) ?? {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/workflows/:id/runs', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { data } = await supabase!
      .from('cortex_workflow_runs')
      .select('*')
      .eq('workflow_id', req.params.id)
      .order('started_at', { ascending: false })
      .limit(50);
    res.json({ runs: data });
  });

  // ─── Approvals ────────────────────────────────────────────────────────
  router.get('/approvals/pending/:tenantId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const list = await listPendingApprovals(req.params.tenantId);
    res.json({ approvals: list });
  });

  router.post('/approvals/:id/decide', async (req: Request, res: Response) => {
    const user = getUserFromJwt(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized (jwt required)' });
      return;
    }
    const body = req.body as { decision?: 'approved' | 'rejected'; reason?: string };
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      res.status(400).json({ error: 'decision must be approved|rejected' });
      return;
    }
    const ok = await decideApproval(req.params.id, body.decision, user.userId, body.reason);
    if (!ok) {
      res.status(404).json({ error: 'approval not found or already decided' });
      return;
    }
    res.json({ ok: true });
  });

  // ─── Outgoing webhooks (admin) ────────────────────────────────────────
  router.get('/webhooks/:tenantId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { data } = await supabase!
      .from('cortex_outgoing_webhooks')
      .select('id, name, url, events, enabled, last_success_at, last_failure_at, consecutive_failures, created_at')
      .eq('tenant_id', req.params.tenantId)
      .order('created_at', { ascending: false });
    res.json({ webhooks: data });
  });

  router.post('/webhooks', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const body = req.body as {
      tenant_id?: string;
      name?: string;
      url?: string;
      events?: string[];
    };
    if (!body.tenant_id || !body.name || !body.url) {
      res.status(400).json({ error: 'tenant_id, name, url obrigatórios' });
      return;
    }
    const secret = generateWebhookSecret();
    const { data, error } = await supabase!
      .from('cortex_outgoing_webhooks')
      .insert({
        tenant_id: body.tenant_id,
        name: body.name,
        url: body.url,
        events: body.events ?? ['*'],
        secret,
      })
      .select('id, name, url, events, enabled, created_at')
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({
      webhook: data,
      secret,
      warning: 'guarde esse secret AGORA — não será exibido novamente',
    });
  });

  router.post('/webhooks/:id/revoke', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { error } = await supabase!
      .from('cortex_outgoing_webhooks')
      .update({ enabled: false })
      .eq('id', req.params.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  // ─── Notifications in-app (user) ─────────────────────────────────────
  router.get('/notifications', async (req: Request, res: Response) => {
    const user = getUserFromJwt(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const list = await listInApp(user.userId);
    res.json({ notifications: list });
  });

  router.post('/notifications/:id/read', async (req: Request, res: Response) => {
    const user = getUserFromJwt(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const ok = await markRead(Number(req.params.id), user.userId);
    if (!ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
