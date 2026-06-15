/**
 * useAccess — controle de acesso da plataforma, POR WORKSPACE (conta).
 *
 * Modelo:
 *   - `app_user_profiles.is_super_admin = true` → operador Thribus.
 *   - `workspace_modules(workspace_id, module_path)` → módulos habilitados por conta.
 *
 * `allowedPaths` (pra conta ativa = activeWorkspaceId):
 *   - conta COM módulos configurados → exatamente esses (+ '/profile').
 *       · super-admin ainda mantém '/access' e '/clients' (não se tranca de fora).
 *   - conta SEM configuração:
 *       · super-admin → null (vê tudo — conta nova ainda não configurada)
 *       · cliente     → defaults `client` de nav.ts
 *
 * Sem Supabase (dev/demo) → admin, pra não travar o painel local.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { useAppStore } from './useAppStore';
import { CLIENT_PATHS } from '@/lib/nav';

const ADMIN_SAFE = ['/access', '/clients']; // super-admin nunca perde acesso à gestão

export interface AccessState {
  isAdmin: boolean;
  /** Paths liberados. `null` = sem restrição (vê tudo). */
  allowedPaths: ReadonlySet<string> | null;
  loading: boolean;
}

export function useAccess(): AccessState {
  const { user, configured, loading: sessionLoading } = useSession();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [state, setState] = useState<AccessState>({ isAdmin: true, allowedPaths: null, loading: configured });

  useEffect(() => {
    if (!supabase || !configured) {
      setState({ isAdmin: true, allowedPaths: null, loading: false });
      return;
    }
    if (sessionLoading) return;
    if (!user) {
      setState({ isAdmin: false, allowedPaths: new Set(['/profile']), loading: false });
      return;
    }

    let active = true;
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      const [{ data: profile }, modsRes] = await Promise.all([
        supabase!.from('app_user_profiles').select('is_super_admin').eq('user_id', user.id).maybeSingle(),
        activeWorkspaceId
          ? supabase!.from('workspace_modules').select('module_path').eq('workspace_id', activeWorkspaceId)
          : Promise.resolve({ data: [] as Array<{ module_path: string }> }),
      ]);
      if (!active) return;

      const isAdmin = Boolean(profile?.is_super_admin);
      const mods = (modsRes.data ?? []).map((r) => r.module_path);

      if (mods.length === 0) {
        // conta ainda não configurada
        setState(
          isAdmin
            ? { isAdmin, allowedPaths: null, loading: false }
            : { isAdmin, allowedPaths: new Set([...CLIENT_PATHS, '/profile']), loading: false },
        );
        return;
      }

      const extra = isAdmin ? ADMIN_SAFE : [];
      setState({ isAdmin, allowedPaths: new Set([...mods, '/profile', ...extra]), loading: false });
    })();

    return () => {
      active = false;
    };
  }, [user, configured, sessionLoading, activeWorkspaceId]);

  return state;
}

/** Compat: papel simples derivado do acesso. */
export function useRole(): { role: 'admin' | 'client'; loading: boolean } {
  const { isAdmin, loading } = useAccess();
  return { role: isAdmin ? 'admin' : 'client', loading };
}
