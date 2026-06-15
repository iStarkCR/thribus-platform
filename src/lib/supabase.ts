/**
 * Supabase Client (frontend)
 *
 * Usa a anon key — segura para expor no browser.
 * RLS no banco controla o acesso.
 *
 * Configure em .env (raiz do projeto):
 *   VITE_SUPABASE_URL=https://xxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGci...
 *   VITE_SUPABASE_SCHEMA=public        (default — produção)
 *   # OU pra staging:
 *   VITE_SUPABASE_SCHEMA=staging
 *
 * Em produção (Vercel): adicione as mesmas variáveis em
 *   Project → Settings → Environment Variables.
 *
 * Pra previews/staging do Vercel (branch develop), defina
 * VITE_SUPABASE_SCHEMA=staging na env "Preview" — assim a versão
 * de develop bate no schema isolado sem tocar no schema prod.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const schema = (import.meta.env.VITE_SUPABASE_SCHEMA ?? 'public') as string;

export const isSupabaseConfigured = !!url && !!anonKey;

// Cria o cliente apenas se as envs estiverem definidas; caso contrário,
// o app cai automaticamente em fallback de memória (SEED_*).
// O TS do supabase-js exige literal type pra schema; cast seguro porque
// validamos a string via env e a lib aceita qualquer schema em runtime.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? (createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }, // login real — sessão sobrevive reload
      db: { schema: schema as 'public' },
    }) as SupabaseClient)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] não configurado — usando fallback de memória.\n' +
      'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env',
  );
} else if (schema !== 'public') {
  console.log(`[supabase] schema="${schema}" (não-prod) — todas as queries vão pra ${schema}.*`);
}
