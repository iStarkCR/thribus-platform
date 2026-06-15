/**
 * Serviço de controle de acesso — usado pela tela "Acessos" (admin).
 *
 * Acesso a módulos é POR WORKSPACE (conta): `workspace_modules`. O super-admin
 * liga/desliga quais módulos cada conta enxerga.
 */

import { supabase } from '@/lib/supabase';

export const accessConfigured = Boolean(supabase);

/** Paths de módulo habilitados pra um workspace. */
export async function listWorkspaceModules(workspaceId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('workspace_modules')
    .select('module_path')
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return (data ?? []).map((r) => r.module_path as string);
}

/** Habilita (enabled) ou desabilita um módulo pra um workspace. Idempotente. */
export async function setWorkspaceModule(workspaceId: string, path: string, enabled: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');

  if (enabled) {
    const { error } = await supabase
      .from('workspace_modules')
      .upsert({ workspace_id: workspaceId, module_path: path }, { onConflict: 'workspace_id,module_path' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('workspace_modules')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('module_path', path);
    if (error) throw error;
  }
}

// ─── Usuários (pra Parte 2: provisionamento de cliente) ─────────────────────
export interface AppUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

export async function listAppUsers(): Promise<AppUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('admin_list_app_users');
  if (error) throw error;
  return (data ?? []).map((r: { user_id: string; email: string; is_super_admin: boolean }) => ({
    userId: r.user_id,
    email: r.email,
    isSuperAdmin: r.is_super_admin,
  }));
}

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface ProvisionUserInput {
  email: string;
  password: string;
  workspaceId: string;
  role: WorkspaceRole;
  name?: string;
}

/** Cria login + vínculo + cargo via Edge Function (service role, gated p/ super-admin). */
export async function provisionUser(input: ProvisionUserInput): Promise<{ userId: string }> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.functions.invoke('provision-user', { body: input });
  if (error) throw new Error(data?.error ?? error.message);
  if (data?.error) throw new Error(data.error);
  return data as { userId: string };
}
