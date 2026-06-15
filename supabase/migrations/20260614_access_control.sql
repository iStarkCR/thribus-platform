-- ============================================================================
-- Controle de acesso da plataforma — listagem de usuários (admin) + RLS
-- ============================================================================
-- Suporta a tela "Acessos": o super-admin libera quais módulos cada usuário vê.
--
-- 1) RPC admin_list_app_users(): lista usuários + email + grants de módulo.
--    Gated: só retorna linhas se o chamador for super-admin. SECURITY DEFINER
--    pra poder ler auth.users (não exposto ao browser).
--
-- 2) Fecha o buraco em app_user_permissions: a policy atual é permissiva
--    ("authenticated full access = true"), o que deixaria um cliente se
--    auto-liberar módulos. Passa a: cada um lê o próprio; só super-admin escreve.
--    (O worker usa service role e ignora RLS — não afeta.)
-- ============================================================================

-- helper: o chamador é super-admin?
create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from app_user_profiles
    where user_id = auth.uid() and is_super_admin = true
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 1) listagem de usuários pro painel de acessos
create or replace function public.admin_list_app_users()
returns table (user_id uuid, email text, is_super_admin boolean, modules text[])
language sql stable security definer
set search_path = public, auth
as $$
  select u.id,
         u.email::text,
         coalesce(p.is_super_admin, false),
         coalesce(
           array_agg(perm.resource_key) filter (where perm.resource_key is not null),
           '{}'::text[]
         )
  from auth.users u
  left join app_user_profiles p on p.user_id = u.id
  left join app_user_permissions perm
         on perm.user_id = u.id and perm.resource_type = 'section'
  where public.is_super_admin()      -- só super-admin enxerga a lista
  group by u.id, u.email, p.is_super_admin
  order by u.email;
$$;

grant execute on function public.admin_list_app_users() to authenticated;

-- 2) RLS de app_user_permissions: self-read, super-admin-write
drop policy if exists "Authenticated full access on user permissions" on app_user_permissions;

create policy "perm_self_read" on app_user_permissions
  for select using (user_id = auth.uid() or public.is_super_admin());

create policy "perm_admin_write" on app_user_permissions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- 3) RLS de app_user_profiles: fecha auto-promoção a super-admin.
--    Cada um lê o próprio; só super-admin escreve (define quem é admin).
drop policy if exists "Authenticated full access on user profiles" on app_user_profiles;

create policy "profile_self_read" on app_user_profiles
  for select using (user_id = auth.uid() or public.is_super_admin());

create policy "profile_admin_write" on app_user_profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());
