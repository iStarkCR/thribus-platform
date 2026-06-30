-- ============================================================================
-- Pasta de trabalho por conversa — o time opera dentro de um repo escolhido
-- ============================================================================
-- O bridge roda `claude` num cwd; esse cwd define em qual pasta o colaborador
-- trabalha (CLAUDE.md, skills e .claude/ daquela pasta). Aqui expomos isso como
-- um seletor por conversa, igual ao seletor de projeto do Claude Code:
--   • cortex_work_folders   → lista curada de pastas (= allowlist de segurança).
--     "Abrir pasta…" no painel insere uma linha nova; só o que está aqui pode
--     virar cwd (um prompt solto não aponta o time pra um caminho arbitrário).
--   • chat_sessions.working_dir → pasta escolhida pra aquela conversa (null =
--     default do colaborador: Bukowiski no cwd dele, os outros no cwd neutro).
-- ============================================================================

alter table public.chat_sessions
  add column if not exists working_dir text;

create table if not exists public.cortex_work_folders (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  path       text not null unique,         -- caminho absoluto no Mac do daemon
  sort       int  not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cortex_work_folders enable row level security;

-- Leitura liberada pro painel; quem está logado pode adicionar/editar pastas.
-- A ponte lê via service role (bypassa RLS).
drop policy if exists "cortex_work_folders_read" on public.cortex_work_folders;
create policy "cortex_work_folders_read" on public.cortex_work_folders
  for select using (true);

drop policy if exists "cortex_work_folders_write" on public.cortex_work_folders;
create policy "cortex_work_folders_write" on public.cortex_work_folders
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Seed curado — repos principais (caminhos verificados no Mac do daemon).
insert into public.cortex_work_folders (label, path, sort) values
  ('thribus-platform', '/Users/charlesandrade/THRIBUS TECH - SISTEMAS/thribus-platform', 10),
  ('CORTEX',           '/Users/charlesandrade/THRIBUS TECH - SISTEMAS/CORTEX',           20),
  ('Thribus-Talkie',   '/Users/charlesandrade/THRIBUS TECH - SISTEMAS/Thribus-Talkie',   30),
  ('thribus-reports',  '/Users/charlesandrade/THRIBUS TECH - SISTEMAS/thribus-reports',  40),
  ('Thribus BI',       '/Users/charlesandrade/THRIBUS TECH - SISTEMAS/Thribus BI',       50),
  ('Bukowiski',        '/Users/charlesandrade/projects/Bukowiski',                       60)
on conflict (path) do nothing;

-- Realtime: o seletor reflete novas pastas na hora.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cortex_work_folders'
  ) then
    alter publication supabase_realtime add table public.cortex_work_folders;
  end if;
end $$;
