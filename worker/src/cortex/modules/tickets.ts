/**
 * Cortex M2 — Módulo Tickets / Suporte.
 *
 * Queue de tickets com prioridade, SLA tracking, mensagens internas/públicas,
 * CSAT post-resolução.
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import { notify } from '../notifications/service.js';
import { emit } from '../webhooks/outgoing.js';
import type { ModuleDefinition } from './types.js';

export const ticketsModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'tickets',
  name: 'Tickets / Suporte',
  slug: 'tickets',
  description: 'Queue de tickets com prioridade, SLA tracking, mensagens internas, CSAT. Carla integrada pra triagem automática.',
  category: 'ops',
  version: '0.1.0',
  status: 'beta',
  icon: 'Headphones',
  tags: ['suporte', 'sac', 'sla', 'helpdesk'],
};

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

const SLA_MINUTES: Record<string, { response: number; resolution: number }> = {
  urgent: { response: 15, resolution: 60 },
  high: { response: 60, resolution: 240 },
  normal: { response: 240, resolution: 1440 },
  low: { response: 480, resolution: 2880 },
};

export function buildTicketsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  router.get('/', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
    let q = supabase!.from('cortex_tickets').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    if (priority) q = q.eq('priority', priority);
    const { data, error } = await q;
    if (error) return void res.status(500).json({ error: error.message });
    res.json({ tickets: data });
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { data: ticket } = await supabase!.from('cortex_tickets').select('*').eq('tenant_id', tenantId).eq('id', req.params.id).maybeSingle();
    if (!ticket) return void res.status(404).json({ error: 'not_found' });
    const { data: messages } = await supabase!.from('cortex_ticket_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
    res.json({ ticket, messages: messages ?? [] });
  });

  router.post('/', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as {
      subject?: string;
      body?: string;
      priority?: string;
      category?: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      source?: string;
      source_ref?: string;
    };
    if (!body.subject) return void res.status(400).json({ error: 'subject obrigatório' });
    const priority = (body.priority && body.priority in SLA_MINUTES) ? body.priority : 'normal';
    const sla = SLA_MINUTES[priority];
    const { data, error } = await supabase!.from('cortex_tickets').insert({
      tenant_id: tenantId,
      subject: body.subject,
      body: body.body ?? '',
      priority,
      category: body.category ?? null,
      customer_name: body.customer_name ?? null,
      customer_email: body.customer_email ?? null,
      customer_phone: body.customer_phone ?? null,
      source: body.source ?? 'manual',
      source_ref: body.source_ref ?? null,
      sla_response_minutes: sla.response,
      sla_resolution_minutes: sla.resolution,
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    void emit({ type: 'ticket.created', tenantId, data: { ticket: data } });
    // Notifica owners
    const { data: owners } = await supabase!.from('cortex_user_tenants').select('user_id').eq('tenant_id', tenantId).in('role', ['owner', 'admin']);
    for (const o of owners ?? []) {
      await notify({
        tenantId,
        userId: o.user_id as string,
        channel: 'in_app',
        title: `Novo ticket #${(data as { number: number }).number}: ${body.subject}`,
        body: body.body ?? '',
        category: 'ticket',
        priority: priority === 'urgent' ? 'urgent' : 'high',
      });
    }
    res.status(201).json({ ticket: data });
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const allowed = ['subject', 'body', 'status', 'priority', 'category', 'assigned_user_id', 'assigned_agent_id'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if (patch.status === 'resolved') {
      patch.resolved_at = new Date().toISOString();
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!.from('cortex_tickets').update(patch).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    if (patch.status === 'resolved') {
      void emit({ type: 'ticket.resolved', tenantId, data: { ticket: data } });
    }
    res.json({ ticket: data });
  });

  router.post('/:id/messages', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as { body?: string; author_id?: string; is_internal?: boolean; attachments?: unknown[] };
    if (!body.body) return void res.status(400).json({ error: 'body obrigatório' });
    const { data, error } = await supabase!.from('cortex_ticket_messages').insert({
      ticket_id: req.params.id,
      tenant_id: tenantId,
      author_id: body.author_id ?? null,
      body: body.body,
      is_internal: body.is_internal ?? false,
      attachments: body.attachments ?? [],
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    // Marca first_response_at se ainda não tem
    await supabase!
      .from('cortex_tickets')
      .update({ first_response_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .is('first_response_at', null);
    res.status(201).json({ message: data });
  });

  // CSAT
  router.post('/:id/csat', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as { score?: number; comment?: string };
    if (typeof body.score !== 'number' || body.score < 1 || body.score > 5) {
      return void res.status(400).json({ error: 'score deve ser 1-5' });
    }
    const { data, error } = await supabase!.from('cortex_tickets').update({
      csat_score: body.score,
      csat_comment: body.comment ?? null,
    }).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    res.json({ ticket: data });
  });

  return router;
}
