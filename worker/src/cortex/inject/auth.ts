/**
 * Autenticação do inject layer.
 *
 * 3 modos, em ordem de prioridade:
 *   1. DB lookup (Fase 2) — tabela cortex_api_keys (migration 012)
 *   2. ENV var (Fase 0)   — CORTEX_API_KEYS="key1:tenant1,key2:tenant2"
 *   3. DEV fallback       — qualquer key vira tenant="dev" (só sem CORTEX_API_KEYS configurado)
 */

import type { TenantContext } from '../types.js';
import { lookupApiKey } from '../tenancy/store.js';

interface ApiKeyEnvEntry {
  tenantId: string;
  workspaceId?: string;
}

let envKeyIndex: Map<string, ApiKeyEnvEntry> | null = null;

function loadEnvKeys(): Map<string, ApiKeyEnvEntry> {
  if (envKeyIndex) return envKeyIndex;
  const raw = process.env.CORTEX_API_KEYS ?? '';
  const map = new Map<string, ApiKeyEnvEntry>();
  if (!raw.trim()) {
    envKeyIndex = map;
    return map;
  }
  for (const entry of raw.split(',')) {
    const parts = entry.trim().split(':');
    const [key, tenantId, workspaceId] = parts;
    if (!key || !tenantId) continue;
    map.set(key.trim(), {
      tenantId: tenantId.trim(),
      workspaceId: workspaceId?.trim(),
    });
  }
  envKeyIndex = map;
  return map;
}

function extractToken(header: string | undefined): string | null {
  if (!header) return null;
  return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
}

export async function authenticate(
  headerValue: string | undefined,
): Promise<TenantContext | null> {
  const token = extractToken(headerValue);

  // Sem token: dev-mode se nada configurado
  if (!token) {
    if (!process.env.CORTEX_API_KEYS && !process.env.CORTEX_REQUIRE_AUTH) {
      return { tenantId: 'dev', tenantName: 'dev-default' };
    }
    return null;
  }

  // 1. Tenta DB primeiro
  const dbResult = await lookupApiKey(token);
  if (dbResult && dbResult !== 'fallback') {
    return {
      tenantId: dbResult.tenant.id,
      tenantName: dbResult.tenant.name,
      workspaceId: dbResult.tenant.workspaceId,
    };
  }

  // 2. ENV var
  const envKeys = loadEnvKeys();
  if (envKeys.size > 0) {
    const entry = envKeys.get(token);
    if (entry) {
      return {
        tenantId: entry.tenantId,
        workspaceId: entry.workspaceId,
      };
    }
    return null; // ENV configurado mas key não bate
  }

  // 3. Dev fallback (só se nem DB nem ENV)
  if (dbResult === 'fallback' && !process.env.CORTEX_REQUIRE_AUTH) {
    return {
      tenantId: token.slice(0, 32) || 'dev',
      tenantName: 'dev-token',
    };
  }

  return null;
}

/** Sync wrapper pra endpoints que ainda usam interface antiga. */
export function authenticateSync(
  headerValue: string | undefined,
): TenantContext | null {
  const token = extractToken(headerValue);
  if (!token) {
    if (!process.env.CORTEX_API_KEYS && !process.env.CORTEX_REQUIRE_AUTH) {
      return { tenantId: 'dev', tenantName: 'dev-default' };
    }
    return null;
  }
  const envKeys = loadEnvKeys();
  if (envKeys.size === 0 && !process.env.CORTEX_REQUIRE_AUTH) {
    return { tenantId: token.slice(0, 32) || 'dev', tenantName: 'dev-token' };
  }
  const entry = envKeys.get(token);
  if (!entry) return null;
  return {
    tenantId: entry.tenantId,
    workspaceId: entry.workspaceId,
  };
}

export function resolveAnthropicKey(_tenant: TenantContext): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}
