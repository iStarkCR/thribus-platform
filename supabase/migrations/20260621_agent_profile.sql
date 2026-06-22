-- Perfil do colaborador: foto (avatar), nome de exibição e cor do tema.
-- Aplicar com `supabase db push` (após `supabase link`) OU colar no SQL Editor
-- do dashboard. Depois disso o front (Fase 4) passa a salvar/exibir o perfil.

alter table agents add column if not exists avatar_url text;
alter table agents add column if not exists display_name text;
alter table agents add column if not exists color text;

-- Bucket PÚBLICO pros avatares (URL sem expiração; avatar não é sensível).
insert into storage.buckets (id, name, public)
values ('agent-avatars', 'agent-avatars', true)
on conflict (id) do nothing;

-- Storage policies: leitura pública; upload/atualização por usuários autenticados.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'agent-avatars read' and tablename = 'objects') then
    create policy "agent-avatars read" on storage.objects
      for select using (bucket_id = 'agent-avatars');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'agent-avatars insert' and tablename = 'objects') then
    create policy "agent-avatars insert" on storage.objects
      for insert to authenticated with check (bucket_id = 'agent-avatars');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'agent-avatars update' and tablename = 'objects') then
    create policy "agent-avatars update" on storage.objects
      for update to authenticated using (bucket_id = 'agent-avatars');
  end if;
end $$;
