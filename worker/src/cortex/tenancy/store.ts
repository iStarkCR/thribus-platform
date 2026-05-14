/**
 * Persistência de tenants + API keys.
 *
 * Tem cache em memória com TTL pra evitar query a cada request.
 * Se a tabela `cortex_tenants` não existir (migration 012 não aplicada),
 * cai no modo env-var (Fase 0).
 */

import { createHash } from 'node:crypto';
import { supabase } from '../../db/supabase.js';

export interface CortexTenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'scale' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  monthlyMessageLimit?: number;
  monthlyCostLimitUsd?: number;
  workspaceId?: string;
  config: Record<string, unknown>;
}

export interface ApiKeyRecord {
  id: number;
  tenantId: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  status: 'active' | 'revoked';
}

const CACHE_TTL_MS = 60_000; // 1 min
interface CacheEntry {
  tenant: CortexTenant;
  key: ApiKeyRecord;
  expiresAt: number;
}
const keyCache = new Map<string, CacheEntry>();

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  if (!err) return false;
  if (err.code === '42P01') return true;
  return /relation .* does not exist/i.test(err.message ?? '');
}

function rowToTenant(row: Record<string, unknown>): CortexTenant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    plan: (row.plan as CortexTenant['plan']) ?? 'starter',
    status: (row.status as CortexTenant['status']) ?? 'active',
    monthlyMessageLimit: (row.monthly_message_limit as number | null) ?? undefined,
    monthlyCostLimitUsd: row.monthly_cost_limit_usd
      ? Number(row.monthly_cost_limit_usd)
      : undefined,
    workspaceId: (row.workspace_id as string | null) ?? undefined,
    config: (row.config as Record<string, unknown>) ?? {},
  };
}

/**
 * Resolve um raw API key → { tenant, key }.
 * Retorna null se key inválida, revogada, ou tenant suspenso.
 * Retorna 'fallback' se a tabela não existir (caller deve cair no modo env).
 */
export async function lookupApiKey(
  rawKey: string,
): Promise<{ tenant: CortexTenant; key: ApiKeyRecord } | null | 'fallback'> {
  if (!supabase) return 'fallback';

  const cached = keyCache.get(rawKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { tenant: cached.tenant, key: cached.key };
  }

  const hash = hashKey(rawKey);

  try {
    const { data, error } = await supabase
      .from('cortex_api_keys')
      .select(
        `id, tenant_id, key_prefix, name, scopes, status,
         cortex_tenants ( id, name, slug, plan, status, monthly_message_limit, monthly_cost_limit_usd, workspace_id, config )`,
      )
      .eq('key_hash', hash)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return 'fallback';
      console.warn('[cortex.tenancy] lookupApiKey erro:', error.message);
      return null;
    }
    if (!data) return null;

    const tenantRaw = (Array.isArray(data.cortex_tenants)
      ? data.cortex_tenants[0]
      : data.cortex_tenants) as Record<string, unknown> | undefined;

    if (!tenantRaw) return null;
    const tenant = rowToTenant(tenantRaw);
    if (tenant.status === 'suspended') return null;

    const key: ApiKeyRecord = {
      id: data.id as number,
      tenantId: data.tenant_id as string,
      keyPrefix: data.key_prefix as string,
      name: data.name as string,
      scopes: (data.scopes as string[]) ?? [],
      status: (data.status as ApiKeyRecord['status']) ?? 'active',
    };

    keyCache.set(rawKey, { tenant, key, expiresAt: Date.now() + CACHE_TTL_MS });

    // Atualiza last_used_at em background — não bloqueia
    supabase
      .from('cortex_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: e }) => {
        if (e) console.warn('[cortex.tenancy] last_used update falhou:', e.message);
      });

    return { tenant, key };
  } catch (err) {
    console.warn('[cortex.tenancy] lookupApiKey ex:', (err as Error).message);
    return null;
  }
}

/** Helper: limpa o cache (testes / rotação de keys). */
export function clearApiKeyCache(): void {
  keyCache.clear();
}

/** Helper: gera uma API key formatada (não persiste — só formato). */
export function generateApiKey(env: 'live' | 'test' = 'live'): {
  raw: string;
  hash: string;
  prefix: string;
} {
  // 32 bytes random em hex = 64 chars
  const random = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');
  const raw = `ck_${env}_${random}`;
  return {
    raw,
    hash: hashKey(raw),
    prefix: raw.slice(0, 12),
  };
}
