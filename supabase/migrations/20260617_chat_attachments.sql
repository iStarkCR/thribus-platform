-- ============================================================================
-- Anexos no chat — imagem, PDF/arquivo, vídeo
-- ============================================================================
-- O usuário cola/anexa no chat → sobe pro bucket 'chat-attachments' → a ponte
-- (service role) baixa pro Mac e entrega ao colaborador (imagem/PDF ele lê via
-- Read; vídeo segue pra uma skill). Caminho: <user_id>/<session_id>/<arquivo>.
-- ============================================================================

alter table public.collaborator_messages
  add column if not exists attachments jsonb;  -- [{path,name,mime,size}]

-- Bucket privado (até 100MB por arquivo; vídeo cabe).
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 104857600)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Cada um sobe/lê/apaga só na própria pasta (<user_id>/...); super-admin vê tudo.
-- A ponte usa service role e ignora isto.
drop policy if exists "chat_attach_insert" on storage.objects;
create policy "chat_attach_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_attach_read" on storage.objects;
create policy "chat_attach_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

drop policy if exists "chat_attach_delete" on storage.objects;
create policy "chat_attach_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
