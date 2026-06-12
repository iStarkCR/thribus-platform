/**
 * Cortex M3 — Routes: audit query UI + integrações + white-label.
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import {
  credentialsConfigured,
  decryptCredential,
  encryptCredential,
} from '../integrations/credentials.js';

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

/**
 * Health-check de conectividade por provider — chamada mínima autenticada.
 * Lança erro com motivo se a credencial for inválida ou o provider não responder.
 */
async function checkProviderHealth(provider: string, token: string): Promise<void> {
  const bearer = { Authorization: `Bearer ${token}` };
  const timeout = AbortSignal.timeout(10_000);

  switch (provider) {
    case 'hubspot': {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { headers: bearer, signal: timeout });
      if (!r.ok) throw new Error(`hubspot_${r.status}`);
      return;
    }
    case 'pipedrive': {
      const r = await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(token)}`, { signal: timeout });
      if (!r.ok) throw new Error(`pipedrive_${r.status}`);
      return;
    }
    case 'slack': {
      const r = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: bearer, signal: timeout });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) throw new Error(`slack_${body.error ?? r.status}`);
      return;
    }
    case 'asaas': {
      const r = await fetch('https://api.asaas.com/v3/customers?limit=1', { headers: { access_token: token }, signal: timeout });
      if (!r.ok) throw new Error(`asaas_${r.status}`);
      return;
    }
    case 'google_calendar': {
      const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', { headers: bearer, signal: timeout });
      if (!r.ok) throw new Error(`google_${r.status}`);
      return;
    }
    default:
      throw new Error(`provider_check_not_implemented: ${provider}`);
  }
}

export function createM3Router(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // ─── Audit log queryable ──────────────────────────────────────────────
  router.get('/audit', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : undefined;
    const agent = typeof req.query.agent === 'string' ? req.query.agent : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : undefined;
    const search = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    let q = supabase!.from('cortex_audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (agent) q = q.eq('selected_agent', agent);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    if (sessionId) q = q.eq('session_id', sessionId);
    if (search) q = q.ilike('input_text', `%${search}%`);

    const { data, error } = await q;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ entries: data });
  });

  router.get('/audit/export', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : undefined;
    if (!tenantId) {
      res.status(400).json({ error: 'tenant_id obrigatório' });
      return;
    }
    const { data } = await supabase!.from('cortex_audit_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10000);

    const csvLines = [
      'created_at,trace_id,session_id,selected_agent,intent,status,latency_ms,estimated_cost_usd,input_text',
      ...(data ?? []).map((r) => {
        const esc = (s: unknown): string => `"${String(s ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        return [
          r.created_at,
          r.trace_id,
          r.session_id,
          r.selected_agent ?? '',
          r.intent ?? '',
          r.status,
          r.latency_ms ?? 0,
          r.estimated_cost_usd ?? 0,
          esc(r.input_text ?? ''),
        ].join(',');
      }),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cortex-audit-${tenantId}-${Date.now()}.csv"`);
    res.send(csvLines.join('\n'));
  });

  // ─── Integrações nativas ──────────────────────────────────────────────
  router.get('/integrations/:tenantId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { data } = await supabase!
      .from('cortex_integrations')
      .select('id, provider, display_name, enabled, last_sync_at, last_sync_status, sync_direction, created_at')
      .eq('tenant_id', req.params.tenantId);
    res.json({ integrations: data });
  });

  router.post('/integrations', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const body = req.body as {
      tenant_id?: string;
      provider?: string;
      display_name?: string;
      sync_direction?: 'push' | 'pull' | 'bidirectional';
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.tenant_id || !body.provider) {
      res.status(400).json({ error: 'tenant_id + provider obrigatórios' });
      return;
    }
    if (body.access_token && !credentialsConfigured) {
      res.status(503).json({ error: 'CORTEX_CRED_KEY não configurada — não é possível armazenar credenciais' });
      return;
    }
    const { data, error } = await supabase!
      .from('cortex_integrations')
      .upsert(
        {
          tenant_id: body.tenant_id,
          provider: body.provider,
          display_name: body.display_name ?? body.provider,
          sync_direction: body.sync_direction ?? 'bidirectional',
          enabled: true,
          ...(body.access_token ? { access_token_encrypted: encryptCredential(body.access_token) } : {}),
          ...(body.refresh_token ? { refresh_token_encrypted: encryptCredential(body.refresh_token) } : {}),
        },
        { onConflict: 'tenant_id,provider' },
      )
      .select('id, provider, display_name, enabled, last_sync_at, last_sync_status, sync_direction, created_at')
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ integration: data });
  });

  router.post('/integrations/:id/sync', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;

    const { data: integration } = await supabase!
      .from('cortex_integrations')
      .select('id, provider, enabled, access_token_encrypted')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!integration) return void res.status(404).json({ error: 'integration not found' });
    if (!integration.enabled) return void res.status(400).json({ error: 'integration disabled' });

    let syncStatus: string;
    if (!integration.access_token_encrypted) {
      syncStatus = 'error: missing_credentials';
    } else {
      try {
        const token = decryptCredential(integration.access_token_encrypted as string);
        await checkProviderHealth(integration.provider as string, token);
        syncStatus = 'success';
      } catch (err) {
        syncStatus = `error: ${(err as Error).message.slice(0, 180)}`;
      }
    }

    const { data } = await supabase!
      .from('cortex_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncStatus,
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    res.status(syncStatus === 'success' ? 200 : 422).json({ integration: data, sync_status: syncStatus });
  });

  router.post('/integrations/:id/revoke', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    await supabase!.from('cortex_integrations').update({ enabled: false }).eq('id', req.params.id);
    res.json({ ok: true });
  });

  // ─── White-label ──────────────────────────────────────────────────────
  router.get('/white-label/:tenantId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const { data } = await supabase!
      .from('cortex_tenants')
      .select('id, name, slug, white_label, custom_domain, parent_tenant_id')
      .eq('id', req.params.tenantId)
      .maybeSingle();
    res.json({ tenant: data });
  });

  router.patch('/white-label/:tenantId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (!requireSb(res)) return;
    const body = req.body as {
      white_label?: {
        brand_name?: string;
        logo_url?: string;
        primary_color?: string;
        favicon_url?: string;
        support_email?: string;
      };
      custom_domain?: string;
      parent_tenant_id?: string;
    };
    const patch: Record<string, unknown> = {};
    if (body.white_label) patch.white_label = body.white_label;
    if (body.custom_domain !== undefined) patch.custom_domain = body.custom_domain;
    if (body.parent_tenant_id !== undefined) patch.parent_tenant_id = body.parent_tenant_id;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase!
      .from('cortex_tenants')
      .update(patch)
      .eq('id', req.params.tenantId)
      .select('id, name, slug, white_label, custom_domain, parent_tenant_id')
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ tenant: data });
  });

  return router;
}
