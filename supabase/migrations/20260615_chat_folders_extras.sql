-- ============================================================================
-- Pastas do chat: subpastas (hierarquia) + cor
-- ============================================================================
alter table public.chat_folders
  add column if not exists parent_id uuid references public.chat_folders(id) on delete cascade,
  add column if not exists color text;

create index if not exists idx_chat_folders_parent on public.chat_folders(parent_id);
