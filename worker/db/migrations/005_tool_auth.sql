-- ══════════════════════════════════════════════════════
-- Migration 005 — Tool authentication & workspace credentials
-- ══════════════════════════════════════════════════════
--
-- Permite criar tools que batem em qualquer API externa
-- (IXC, HubSpot, Salesforce, sistemas internos do cliente)
-- sem precisar passar por n8n. As credenciais ficam no workspace
-- do cliente (não em env vars do worker), então cadastrar um
-- cliente novo é só criar workspace + popular credentials no painel.
--
-- Cole no SQL Editor do Supabase e execute.
-- ══════════════════════════════════════════════════════

-- ─── Workspaces: cofre genérico de credenciais ────────────────────────────────
-- Mapa de chave → valor. Tools referenciam por nome simbólico.
-- Ex: { "ixc_token": "AB12...", "ixc_hash": "xyz..." }
--     { "hubspot_key": "pat-na1-..." }
alter table workspaces
  add column if not exists credentials jsonb not null default '{}'::jsonb;

comment on column workspaces.credentials is
  'Mapa key→value de credenciais do cliente (tokens, hashes, API keys). Tools referenciam por nome simbólico.';

-- ─── Tools: configuração de autenticação ──────────────────────────────────────
alter table tools
  add column if not exists auth_type        text,
  add column if not exists auth_credentials jsonb,
  add column if not exists extra_headers    jsonb;

-- Constraint: auth_type só aceita valores conhecidos (ou null = sem auth)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tools_auth_type_check'
  ) then
    alter table tools
      add constraint tools_auth_type_check
      check (auth_type is null or auth_type in ('basic','bearer','apikey'));
  end if;
end $$;

comment on column tools.auth_type is
  'Tipo de autenticação: basic | bearer | apikey | null (sem auth).';
comment on column tools.auth_credentials is
  'Refs pras credenciais do workspace. Formato depende do auth_type. Ex basic: {"username_ref":"ixc_token","password_ref":"ixc_hash"}; bearer: {"token_ref":"hubspot_key"}; apikey: {"header_name":"X-API-Key","value_ref":"foo_key"}.';
comment on column tools.extra_headers is
  'Headers fixos (não-auth) injetados na requisição. Ex: {"ixcsoft":"listar","Accept":"application/json"}.';
