-- ══════════════════════════════════════════════════════
-- Roles do PostgREST self-hosted (replica padrão Supabase)
-- ══════════════════════════════════════════════════════
-- Cria a hierarquia de roles que o PostgREST espera:
--
--   authenticator     — role que o PostgREST usa pra logar (NOLOGIN exception:
--                        precisa LOGIN). Faz `SET ROLE` pra anon/authenticated/
--                        service_role conforme o JWT recebido.
--   anon              — requests SEM JWT. Permissões mínimas.
--   authenticated     — requests COM JWT válido (usuário logado).
--   service_role      — bypass total de RLS (usado pelo worker).
--
-- Aplicação: roda em qualquer Postgres da Thribus (staging ou prod).
-- Idempotente — pode rodar várias vezes.
--
-- ATENÇÃO: a senha do `authenticator` precisa estar configurada via env var
-- `PG_AUTHENTICATOR_PASSWORD` no PostgREST. Após rodar este script, faça:
--
--     ALTER ROLE authenticator WITH PASSWORD '<senha-gerada>';
--
-- Nunca comite a senha aqui no SQL.
-- ══════════════════════════════════════════════════════

-- ─── 1. anon (request sem JWT) ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
end $$;

-- ─── 2. authenticated (request com JWT válido) ──────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

-- ─── 3. service_role (worker, bypass RLS) ───────────────────────────────────
-- NOBYPASSRLS removido propositalmente — service_role IGNORA RLS.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ─── 4. authenticator (PostgREST loga com este, faz SET ROLE) ───────────────
-- LOGIN obrigatório pra PostgREST conectar.
-- A senha é setada via env var no Coolify, não aqui.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

-- Permite o authenticator assumir os outros roles via SET ROLE
grant anon          to authenticator;
grant authenticated to authenticator;
grant service_role  to authenticator;

-- ─── 5. Permissões base no schema public ────────────────────────────────────
-- service_role tem acesso completo
grant all on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- anon e authenticated começam com USAGE no schema (não acessam tabelas
-- até que policies de RLS habilitem). Isso é seguro — RLS denies por default.
grant usage on schema public to anon, authenticated;

-- Grants seletivos: tabelas que o painel/anon precisa ler.
-- Por enquanto: nenhuma. RLS controla tudo.
-- Quando habilitar painel via PostgREST, cada tabela precisa:
--   1. enable RLS (já feito nas migrations)
--   2. create policy "anon_select" on <tabela> for select to anon using (...);
--
-- Pra worker (service_role) tudo funciona out-of-the-box — bypass RLS.

-- ─── 6. Default privileges pra tabelas futuras ─────────────────────────────
-- Garante que migrações novas dão SELECT/INSERT/UPDATE/DELETE pro service_role
-- automaticamente (sem precisar GRANT manual a cada migration).
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;

-- ─── 7. Verificação ────────────────────────────────────────────────────────
select rolname, rolsuper, rolcanlogin, rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
order by rolname;
