/**
 * Vault — secrets do workspace + API keys outbound.
 *
 * Frontend só vê masked_value e metadata.
 * Encriptação/decriptação acontece dentro do Postgres via vault_encrypt/decrypt.
 */

import { supabase } from '@/lib/supabase';
import type { SecretEntry, ApiKey } from '@/lib/seed-final';

export const vaultConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface SecretRow {
  id: string; workspace_id: string; key: string;
  category: SecretEntry['category']; masked_value: string;
  rotates_every_days: number | null; last_used_at: string | null;
  created_at: string;
}

interface ApiKeyRow {
  id: string; workspace_id: string; label: string;
  prefix: string; scopes: string[];
  last_used_at: string | null; expires_at: string | null;
  created_at: string;
}

export async function listSecrets(workspaceId: string): Promise<SecretEntry[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('workspace_secrets')
    .select('id, workspace_id, key, category, masked_value, rotates_every_days, last_used_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('key');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as SecretRow;
    return {
      id: row.id, key: row.key, category: row.category,
      maskedValue: row.masked_value,
      rotatesEveryDays: row.rotates_every_days ?? undefined,
      lastUsedAt: row.last_used_at ?? undefined,
      createdAt: row.created_at,
    };
  });
}

export async function upsertSecret(params: {
  workspaceId: string; key: string; category: SecretEntry['category'];
  value: string; rotatesEveryDays?: number;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');

  // Chama RPC que encripta dentro do DB (não exposta no client)
  const masked = maskSecret(params.value);
  const { error } = await supabase.rpc('upsert_workspace_secret', {
    p_workspace_id: params.workspaceId,
    p_key: params.key,
    p_category: params.category,
    p_value: params.value,
    p_masked: masked,
    p_rotates_every_days: params.rotatesEveryDays ?? null,
  });
  if (error) throw error;
}

export async function rotateSecret(id: string, newValue: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.rpc('rotate_workspace_secret', {
    p_id: id, p_value: newValue, p_masked: maskSecret(newValue),
  });
  if (error) throw error;
}

export async function deleteSecret(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('workspace_secrets').delete().eq('id', id);
  if (error) throw error;
}

function maskSecret(s: string): string {
  if (s.length <= 8) return '•••••••';
  return s.slice(0, 4) + '•'.repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function listApiKeys(workspaceId: string): Promise<ApiKey[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, workspace_id, label, prefix, scopes, last_used_at, expires_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as ApiKeyRow;
    return {
      id: row.id, label: row.label, prefix: row.prefix, scopes: row.scopes,
      lastUsedAt: row.last_used_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      createdAt: row.created_at,
    };
  });
}

export async function createApiKey(params: {
  workspaceId: string; label: string; scopes: string[]; expiresAt?: string;
}): Promise<{ id: string; full_key: string; prefix: string }> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.rpc('create_api_key', {
    p_workspace_id: params.workspaceId,
    p_label: params.label,
    p_scopes: params.scopes,
    p_expires_at: params.expiresAt ?? null,
  });
  if (error) throw error;
  return data as { id: string; full_key: string; prefix: string };
}

export async function deleteApiKey(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('api_keys').delete().eq('id', id);
  if (error) throw error;
}
