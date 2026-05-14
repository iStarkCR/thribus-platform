/**
 * Cortex Enterprise — Módulo Propostas.
 *
 * CRUD de propostas comerciais com items, total calculado e tracking de status:
 *   draft → sent → viewed → accepted/rejected → (expired se passou valid_until)
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import type { ModuleDefinition } from './types.js';

export const proposalsModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'proposals',
  name: 'Propostas',
  slug: 'propostas',
  description:
    'Propostas comerciais com items, total, validade, tracking de envio/visualização/aceite.',
  category: 'sales',
  version: '0.1.0',
  status: 'beta',
  icon: 'FileText',
  tags: ['propostas', 'vendas', 'pipeline'],
};

interface ProposalItem {
  description: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return false;
  }
  return true;
}

async function withTenant(req: Request, res: Response): Promise<string | null> {
  const tenant = await authenticate(req.headers.authorization as string | undefined);
  if (!tenant) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return tenant.tenantId;
}

function calcTotal(items: ProposalItem[] | undefined): number {
  if (!items || !Array.isArray(items)) return 0;
  return items.reduce((acc, it) => {
    const sub = it.subtotal ?? (it.qty || 0) * (it.unit_price || 0);
    return acc + (Number.isFinite(sub) ? sub : 0);
  }, 0);
}

export function buildProposalsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '1mb' }));

  router.get('/', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    let q = supabase!
      .from('cortex_proposals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ proposals: data });
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from('cortex_proposals')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ proposal: data });
  });

  router.post('/', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const body = req.body as {
      title?: string;
      client_name?: string;
      client_email?: string;
      number?: string;
      summary?: string;
      body_md?: string;
      items?: ProposalItem[];
      valid_until?: string;
      currency?: string;
    };
    if (!body.title || !body.client_name) {
      res.status(400).json({ error: 'title e client_name obrigatórios' });
      return;
    }
    const items = body.items ?? [];
    const total = calcTotal(items);
    const { data, error } = await supabase!
      .from('cortex_proposals')
      .insert({
        tenant_id: tenantId,
        number: body.number ?? null,
        title: body.title,
        client_name: body.client_name,
        client_email: body.client_email ?? null,
        summary: body.summary ?? '',
        body_md: body.body_md ?? '',
        items,
        total_value: total,
        currency: body.currency ?? 'BRL',
        valid_until: body.valid_until ?? null,
        status: 'draft',
      })
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ proposal: data });
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;

    const allowed = [
      'number',
      'title',
      'client_name',
      'client_email',
      'summary',
      'body_md',
      'items',
      'valid_until',
      'currency',
      'status',
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if (Array.isArray(patch.items)) {
      patch.total_value = calcTotal(patch.items as ProposalItem[]);
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!
      .from('cortex_proposals')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ proposal: data });
  });

  // Transições de status com timestamps
  router.post('/:id/send', async (req: Request, res: Response) => {
    return transitionStatus(req, res, 'sent', 'sent_at');
  });
  router.post('/:id/mark-viewed', async (req: Request, res: Response) => {
    return transitionStatus(req, res, 'viewed', 'viewed_at');
  });
  router.post('/:id/accept', async (req: Request, res: Response) => {
    return transitionStatus(req, res, 'accepted', 'accepted_at');
  });
  router.post('/:id/reject', async (req: Request, res: Response) => {
    return transitionStatus(req, res, 'rejected', 'rejected_at');
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const { error } = await supabase!
      .from('cortex_proposals')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .eq('status', 'draft');
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(204).end();
  });

  return router;
}

async function transitionStatus(
  req: Request,
  res: Response,
  status: string,
  timestampField: string,
): Promise<void> {
  const tenant = await authenticate(req.headers.authorization as string | undefined);
  if (!tenant) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return;
  }
  const { data, error } = await supabase
    .from('cortex_proposals')
    .update({
      status,
      [timestampField]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenant.tenantId)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ proposal: data });
}
