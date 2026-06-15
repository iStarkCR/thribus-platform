-- ============================================================================
-- Acesso a módulos POR WORKSPACE (conta), não por usuário.
-- ============================================================================
-- Cada conta tem um conjunto de módulos habilitados. Ao entrar na conta (switcher),
-- o menu mostra só esses módulos — pro admin (preview) e pro cliente.
--
-- Regra de exibição (no front, useAccess):
--   - workspace COM linhas aqui  → vê exatamente esses módulos
--   - workspace SEM linhas:
--       · super-admin → vê tudo (conta ainda não configurada)
--       · cliente     → defaults `client` de nav.ts
--   - super-admin sempre mantém /access e /clients (não se tranca de fora)
-- ============================================================================

create table if not exists public.workspace_modules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  module_path  text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, module_path)
);

create index if not exists idx_workspace_modules_ws on public.workspace_modules(workspace_id);

alter table public.workspace_modules enable row level security;

-- leitura: membro da conta (pra renderizar o próprio menu) ou super-admin
create policy "wsmod_read" on public.workspace_modules
  for select
  using (workspace_id in (select current_user_workspaces()) or public.is_super_admin());

-- escrita: só super-admin configura
create policy "wsmod_admin_write" on public.workspace_modules
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
