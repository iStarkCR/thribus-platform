-- ============================================================================
-- Navegador de pastas — o painel (web) lista o filesystem do Mac via bridge
-- ============================================================================
-- O painel roda no navegador e NÃO acessa o filesystem; quem acessa é o bridge
-- (Node, no Mac do daemon). Aqui criamos um canal pedido/resposta: o painel
-- insere um pedido (path a listar), o bridge lista os subdiretórios e devolve em
-- `entries`. Assim o seletor "Abrir pasta…" vira um navegador real, com caminho
-- absoluto (que é o que o bridge precisa pra cwd — ver [[work-folders]]).
-- ============================================================================

create table if not exists public.fs_browse_requests (
  id          uuid primary key default gen_random_uuid(),
  path        text,                                  -- dir a listar (vazio = home do daemon)
  status      text not null default 'pending' check (status in ('pending','done','error')),
  entries     jsonb,                                 -- [{ name, path }] (só diretórios)
  error       text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_fs_browse_pending
  on public.fs_browse_requests(status, created_at) where status = 'pending';

alter table public.fs_browse_requests enable row level security;

-- Quem está logado no painel pede e lê; o bridge resolve via service role.
drop policy if exists "fs_browse_read" on public.fs_browse_requests;
create policy "fs_browse_read" on public.fs_browse_requests
  for select using (true);

drop policy if exists "fs_browse_insert" on public.fs_browse_requests;
create policy "fs_browse_insert" on public.fs_browse_requests
  for insert with check (auth.uid() is not null);

-- Realtime: o painel recebe a resposta do bridge na hora.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'fs_browse_requests'
  ) then
    alter publication supabase_realtime add table public.fs_browse_requests;
  end if;
end $$;
