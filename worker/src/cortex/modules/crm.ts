/**
 * Cortex M2 — Módulo CRM (Leads + Deals + Pipeline).
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import { emit } from '../webhooks/outgoing.js';
import type { ModuleDefinition } from './types.js';

export const crmModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'crm',
  name: 'CRM / Pipeline',
  slug: 'crm',
  description: 'Leads com qualificação BANT, kanban de oportunidades, forecast ponderado por estágio.',
  category: 'sales',
  version: '0.1.0',
  status: 'beta',
  icon: 'TrendingUp',
  tags: ['crm', 'leads', 'pipeline', 'vendas'],
};

const DEAL_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;

async function tid(req: Request, res: Response): Promise<string | null> {
  const t = await authenticate(req.headers.authorization as string | undefined);
  if (!t) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return t.tenantId;
}

function sb(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return false;
  }
  return true;
}

export function buildCrmRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // ─── Leads ────────────────────────────────────────────────────────────
  router.get('/leads', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let q = supabase!.from('cortex_crm_leads').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return void res.status(500).json({ error: error.message });
    res.json({ leads: data });
  });

  router.post('/leads', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      source?: string;
      notes?: string;
      custom_fields?: Record<string, unknown>;
    };
    if (!body.name) return void res.status(400).json({ error: 'name obrigatório' });
    const { data, error } = await supabase!.from('cortex_crm_leads').insert({
      tenant_id: tenantId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      source: body.source ?? 'manual',
      notes: body.notes ?? null,
      custom_fields: body.custom_fields ?? {},
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    void emit({ type: 'crm.lead.created', tenantId, data: { lead: data } });
    res.status(201).json({ lead: data });
  });

  router.patch('/leads/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const allowed = ['name', 'email', 'phone', 'company', 'source', 'status', 'notes', 'owner_user_id', 'custom_fields', 'budget_score', 'authority_score', 'need_score', 'timeline_score'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!.from('cortex_crm_leads').update(patch).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    res.json({ lead: data });
  });

  router.delete('/leads/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { error } = await supabase!.from('cortex_crm_leads').delete().eq('tenant_id', tenantId).eq('id', req.params.id);
    if (error) return void res.status(400).json({ error: error.message });
    res.status(204).end();
  });

  // ─── Deals (Kanban) ───────────────────────────────────────────────────
  router.get('/deals', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
    let q = supabase!.from('cortex_crm_deals').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(300);
    if (stage) q = q.eq('stage', stage);
    const { data, error } = await q;
    if (error) return void res.status(500).json({ error: error.message });
    res.json({ deals: data });
  });

  router.post('/deals', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as {
      title?: string;
      lead_id?: string;
      stage?: string;
      value?: number;
      probability?: number;
      expected_close?: string;
      owner_user_id?: string;
      notes?: string;
    };
    if (!body.title) return void res.status(400).json({ error: 'title obrigatório' });
    const stage = (body.stage && DEAL_STAGES.includes(body.stage as typeof DEAL_STAGES[number])) ? body.stage : 'lead';
    const { data, error } = await supabase!.from('cortex_crm_deals').insert({
      tenant_id: tenantId,
      title: body.title,
      lead_id: body.lead_id ?? null,
      stage,
      value: body.value ?? 0,
      probability: body.probability ?? 50,
      expected_close: body.expected_close ?? null,
      owner_user_id: body.owner_user_id ?? null,
      notes: body.notes ?? null,
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    res.status(201).json({ deal: data });
  });

  router.patch('/deals/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const allowed = ['title', 'stage', 'value', 'probability', 'expected_close', 'owner_user_id', 'notes', 'close_reason'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if (patch.stage === 'won' || patch.stage === 'lost') {
      patch.closed_at = new Date().toISOString();
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!.from('cortex_crm_deals').update(patch).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    if (patch.stage === 'won') {
      void emit({ type: 'crm.deal.won', tenantId, data: { deal: data } });
    }
    res.json({ deal: data });
  });

  // ─── Forecast simples ─────────────────────────────────────────────────
  router.get('/forecast', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { data } = await supabase!.from('cortex_crm_deals').select('stage, value, probability').eq('tenant_id', tenantId).not('stage', 'in', '(won,lost)');
    const byStage: Record<string, { count: number; total: number; weighted: number }> = {};
    let totalWeighted = 0;
    let total = 0;
    for (const d of data ?? []) {
      const v = Number(d.value ?? 0);
      const p = Number(d.probability ?? 50) / 100;
      const stage = String(d.stage);
      if (!byStage[stage]) byStage[stage] = { count: 0, total: 0, weighted: 0 };
      byStage[stage].count += 1;
      byStage[stage].total += v;
      byStage[stage].weighted += v * p;
      total += v;
      totalWeighted += v * p;
    }
    res.json({ by_stage: byStage, total, total_weighted: totalWeighted });
  });

  return router;
}
