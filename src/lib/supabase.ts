/**
 * Supabase Client (frontend)
 *
 * Usa a anon key — segura para expor no browser.
 * RLS no banco controla o acesso.
 *
 * Configure em .env (raiz do projeto):
 *   VITE_SUPABASE_URL=https://xxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGci...
 *
 * Em produção (Vercel): adicione as mesmas variáveis em
 *   Project → Settings → Environment Variables.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = !!url && !!anonKey;

// Cria o cliente apenas se as envs estiverem definidas; caso contrário,
// o app cai automaticamente em fallback de memória (SEED_*).
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false }, // single-tenant por enquanto, sem login
    })
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] não configurado — usando fallback de memória.\n' +
      'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env',
  );
}
