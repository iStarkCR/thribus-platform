/**
 * Supabase Client (worker)
 *
 * Usa SERVICE_ROLE_KEY (bypass de RLS) — NUNCA expor pro frontend.
 *
 * Configure em worker/.env:
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
 *   SUPABASE_SCHEMA=public            (default — produção)
 *   # OU pra staging:
 *   SUPABASE_SCHEMA=staging           (mesmo projeto, schema separado)
 *
 * Estratégia de staging: mesmo projeto Supabase do prod, schema isolado
 * `staging` no mesmo banco. Worker staging conecta com SUPABASE_SCHEMA=staging
 * e todas as queries vão pras tabelas staging.* — zero impacto em produção.
 * Veja `worker/db/migrations/staging/setup.sql` pra criar o schema.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const schema = process.env.SUPABASE_SCHEMA ?? 'public';

export const isSupabaseConfigured = !!url && !!serviceKey;

// O TS do supabase-js exige literal type pra schema; cast seguro porque
// validamos a string via env e a lib aceita qualquer schema em runtime.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? (createClient(url, serviceKey, {
      auth: { persistSession: false },
      db: { schema: schema as 'public' },
    }) as SupabaseClient)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos — rodando em modo stub.',
  );
} else if (schema !== 'public') {
  console.log(`[supabase] schema="${schema}" (não-prod) — todas as queries vão pra ${schema}.*`);
}
