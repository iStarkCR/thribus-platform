/**
 * Cortex M3 — RBAC middleware.
 *
 * Verifica role + permissions do user no tenant antes de acessar endpoint.
 *
 * Roles padrão:
 *   - owner    → tudo
 *   - admin    → tudo exceto delete tenant, billing
 *   - member   → CRUD nos módulos que tem permission
 *   - viewer   → read-only
 *
 * Permissions override fine-grained: { "contracts.delete": false, "billing.read": true }
 */

import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../../db/supabase.js';
import { verifyJwt } from './sso.js';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Permission = `${string}.${'read' | 'write' | 'delete' | 'admin'}`;

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

// Defaults — sobreescritos por user.permissions
const ROLE_DEFAULT_PERMS: Record<Role, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set([
    '*.read', '*.write', '*.delete',
    'agents.*', 'modules.*', 'workflows.*', 'webhooks.*',
    'tenant.read', 'tenant.write',
    'users.*', 'api_keys.*',
    'billing.read',
  ]),
  member: new Set([
    'agents.read', 'modules.read', 'modules.write',
    'crm.*', 'tickets.*', 'kb.*', 'talki.*',
    'contracts.read', 'contracts.write',
    'proposals.read', 'proposals.write',
  ]),
  viewer: new Set([
    '*.read',
  ]),
};

function matches(pattern: string, requested: string): boolean {
  if (pattern === '*' || pattern === requested) return true;
  // wildcards: contracts.*, *.read
  const [pMod, pAct] = pattern.split('.');
  const [rMod, rAct] = requested.split('.');
  const modOk = pMod === '*' || pMod === rMod;
  const actOk = pAct === '*' || pAct === rAct;
  return modOk && actOk;
}

export interface AuthedRequest extends Request {
  cortexUser?: { userId: string; email: string };
  cortexRole?: Role;
  cortexTenantId?: string;
  cortexPermissions?: string[];
}

export async function rbacMiddleware(
  tenantId: string,
  permission: string,
): Promise<(req: AuthedRequest, res: Response, next: NextFunction) => void> {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return void res.status(401).json({ error: 'no_token' });
    const payload = verifyJwt(token);
    if (!payload) return void res.status(401).json({ error: 'invalid_token' });
    if (!supabase) return void res.status(503).json({ error: 'supabase not configured' });

    const { data } = await supabase
      .from('cortex_user_tenants')
      .select('role, permissions')
      .eq('user_id', payload.sub)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!data) return void res.status(403).json({ error: 'not_in_tenant' });

    const role = (data.role as Role) ?? 'viewer';
    const overrides = (data.permissions as Record<string, boolean>) ?? {};
    const defaults = ROLE_DEFAULT_PERMS[role] ?? new Set();

    // Check overrides primeiro
    if (permission in overrides) {
      if (!overrides[permission]) return void res.status(403).json({ error: 'forbidden', permission });
    } else {
      // Default by role
      const granted = Array.from(defaults).some((p) => matches(p, permission));
      if (!granted) return void res.status(403).json({ error: 'forbidden', permission, role });
    }

    req.cortexUser = { userId: payload.sub, email: payload.email };
    req.cortexRole = role;
    req.cortexTenantId = tenantId;
    req.cortexPermissions = Array.from(defaults).concat(
      Object.entries(overrides).filter(([, v]) => v).map(([k]) => k),
    );
    next();
  };
}

export function compareRoles(a: Role, b: Role): number {
  return ROLE_HIERARCHY[a] - ROLE_HIERARCHY[b];
}
