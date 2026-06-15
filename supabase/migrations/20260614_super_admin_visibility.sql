-- ============================================================================
-- Visibilidade do super-admin (operador da plataforma)
-- ============================================================================
-- Modelo multi-tenant: o super-admin enxerga TODOS os workspaces e agentes
-- (pra gerenciar/entrar em qualquer conta no switcher). O cliente continua
-- escopado ao(s) workspace(s) de que é membro. (Worker usa service role → ignora RLS.)
-- ============================================================================

-- workspaces: leitura
drop policy if exists "ws_select" on public.workspaces;
create policy "ws_select" on public.workspaces
  for select
  using (id in (select current_user_workspaces()) or public.is_super_admin());

-- agents: isolamento por workspace + super-admin vê tudo
drop policy if exists "agents_workspace_isolated" on public.agents;
create policy "agents_workspace_isolated" on public.agents
  for all
  using (
    workspace_id is null
    or workspace_id in (select current_user_workspaces())
    or public.is_super_admin()
  )
  with check (
    workspace_id is null
    or workspace_id in (select current_user_workspaces())
    or public.is_super_admin()
  );
