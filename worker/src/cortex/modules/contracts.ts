/**
 * Cortex Enterprise — Módulo Contratos.
 *
 * CRUD de contratos com fluxo: draft → sent → signed → active → expired/canceled.
 * Endpoints REST em /cortex/modules/contracts.
 *
 * Auth: usa o mesmo middleware do inject layer (API key Bearer → tenant).
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import type { ModuleDefinition } from './types.js';

export const contractsModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'contracts',
  name: 'Contratos',
  slug: 'contratos',
  description:
    'Gestão de contratos com fluxo de status (draft → sent → signed → active) e trilha de auditoria.',
  category: 'sales',
  version: '0.1.0',
  status: 'beta',
  icon: 'FileSignature',
  tags: ['contratos', 'assinatura', 'compliance'],
};

interface ContractRow {
  id: string;
  number: string | null;
  title: string;
  party_name: string;
  party_document: string | null;
  party_email: string | null;
  body_md: string;
  total_value: number | null;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: 'supabase not configured' });
    return false;
  }
  return true;
}

async function withTenant(
  req: Request,
  res: Response,
): Promise<string | null> {
  const tenant = await authenticate(req.headers.authorization as string | undefined);
  if (!tenant) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return tenant.tenantId;
}

export function buildContractsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // LIST
  router.get('/', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    let q = supabase!
      .from('cortex_contracts')
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
    res.json({ contracts: data });
  });

  // GET
  router.get('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from('cortex_contracts')
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
    res.json({ contract: data });
  });

  // CREATE
  router.post('/', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const body = req.body as Partial<ContractRow>;
    if (!body.title || !body.party_name) {
      res.status(400).json({ error: 'title e party_name obrigatórios' });
      return;
    }
    const { data, error } = await supabase!
      .from('cortex_contracts')
      .insert({
        tenant_id: tenantId,
        number: body.number ?? null,
        title: body.title,
        party_name: body.party_name,
        party_document: body.party_document ?? null,
        party_email: body.party_email ?? null,
        body_md: body.body_md ?? '',
        total_value: body.total_value ?? null,
        currency: body.currency ?? 'BRL',
        starts_on: body.starts_on ?? null,
        ends_on: body.ends_on ?? null,
        status: body.status ?? 'draft',
      })
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ contract: data });
  });

  // UPDATE
  router.patch('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const allowed = [
      'number',
      'title',
      'party_name',
      'party_document',
      'party_email',
      'body_md',
      'total_value',
      'currency',
      'starts_on',
      'ends_on',
      'status',
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!
      .from('cortex_contracts')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ contract: data });
  });

  // SIGN (assinatura digital simples — registra timestamp + IP)
  router.post('/:id/sign', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';
    const { data, error } = await supabase!
      .from('cortex_contracts')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
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
    res.json({ contract: data });
  });

  // DELETE (só drafts)
  router.delete('/:id', async (req: Request, res: Response) => {
    const tenantId = await withTenant(req, res);
    if (!tenantId) return;
    if (!requireSupabase(res)) return;
    const { error } = await supabase!
      .from('cortex_contracts')
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
