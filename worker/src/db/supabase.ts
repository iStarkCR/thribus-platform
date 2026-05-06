/**
 * Supabase Client (worker)
 *
 * Usa SERVICE_ROLE_KEY (bypass de RLS) — NUNCA expor pro frontend.
 * Configure em worker/.env:
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const isSupabaseConfigured = !!url && !!serviceKey;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos — rodando em modo stub.',
  );
}
