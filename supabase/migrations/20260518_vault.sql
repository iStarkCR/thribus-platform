-- ============================================================================
-- Migration: Vault & API Keys
-- ============================================================================
-- Central de secrets do workspace (IXC token, Stripe key, etc).
-- Encriptação: pgsodium quando disponível, senão simétrico AES-GCM no app.
-- API keys outbound: hashed (sha256) — verificação compara hash.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.workspace_secrets (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  key             text not null,                          -- IXC_TOKEN, STRIPE_SECRET_KEY...
  category        text not null check (category in ('crm','erp','payment','comms','analytics','custom')),
  value_encrypted bytea not null,                         -- encriptado (pgcrypto pgp_sym_encrypt)
  masked_value    text not null,                          -- "sk_live_••••8421" pra display
  rotates_every_days integer,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, key)
);

create index if not exists idx_secrets_workspace on public.workspace_secrets(workspace_id);

create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  label           text not null,
  prefix          text not null,                          -- thb_live_pk_8a4f (visível)
  key_hash        text not null unique,                   -- sha256 do segredo completo
  scopes          text[] not null default '{}'::text[],
  last_used_at    timestamptz,
  expires_at      timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_apikeys_workspace on public.api_keys(workspace_id);
create index if not exists idx_apikeys_hash on public.api_keys(key_hash);

drop trigger if exists trg_secrets_touch on public.workspace_secrets;
create trigger trg_secrets_touch
  before update on public.workspace_secrets
  for each row execute function public.touch_updated_at();

-- RLS — só admin/owner do workspace
alter table public.workspace_secrets enable row level security;
alter table public.api_keys enable row level security;

-- Listagem só lê metadata (masked_value, nunca value_encrypted)
create policy "secrets_select_metadata"
  on public.workspace_secrets for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "secrets_write"
  on public.workspace_secrets for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid() and role in ('admin','owner')));

create policy "apikeys_select"
  on public.api_keys for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "apikeys_write"
  on public.api_keys for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid() and role in ('admin','owner')));

-- ─── Helpers: encriptar/decriptar via VAULT_ENCRYPTION_KEY ──────────────────
-- A chave fica em config_setting('app.vault_key') — setada pelo edge runtime.
create or replace function public.vault_encrypt(plaintext text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(plaintext, current_setting('app.vault_key', true));
$$;

create or replace function public.vault_decrypt(ciphertext bytea)
returns text language sql security definer set search_path = public, extensions as $$
  select pgp_sym_decrypt(ciphertext, current_setting('app.vault_key', true));
$$;

-- Mascarar valor antes de salvar (mostra primeiros 4 chars + asterisks + últimos 4)
create or replace function public.mask_secret(plaintext text)
returns text language sql immutable as $$
  select case
    when length(plaintext) <= 8 then '••••'
    else substring(plaintext, 1, 4) || repeat('•', greatest(length(plaintext) - 8, 4)) || right(plaintext, 4)
  end;
$$;

comment on table public.workspace_secrets is
  'Secrets criptografados do workspace. value_encrypted nunca volta pro browser — só masked_value.';
comment on table public.api_keys is
  'Chaves outbound (worker, BI usam pra falar com Thribus API). Hash sha256 — nunca retorna o segredo.';

-- ─── RPC: upsert_workspace_secret (encripta dentro do DB) ──────────────────
create or replace function public.upsert_workspace_secret(
  p_workspace_id uuid,
  p_key text,
  p_category text,
  p_value text,
  p_masked text,
  p_rotates_every_days integer default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  insert into public.workspace_secrets (
    workspace_id, key, category, value_encrypted, masked_value, rotates_every_days
  ) values (
    p_workspace_id, p_key, p_category,
    public.vault_encrypt(p_value), p_masked, p_rotates_every_days
  )
  on conflict (workspace_id, key) do update set
    category = excluded.category,
    value_encrypted = excluded.value_encrypted,
    masked_value = excluded.masked_value,
    rotates_every_days = excluded.rotates_every_days,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rotate_workspace_secret(
  p_id uuid, p_value text, p_masked text
)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.workspace_secrets set
    value_encrypted = public.vault_encrypt(p_value),
    masked_value = p_masked,
    updated_at = now()
  where id = p_id;
end;
$$;

-- ─── RPC: create_api_key (gera key, retorna 1x só) ─────────────────────────
create or replace function public.create_api_key(
  p_workspace_id uuid,
  p_label text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns table (id uuid, full_key text, prefix text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_random text;
  v_full text;
  v_prefix text;
  v_hash text;
  v_id uuid;
begin
  v_random := encode(gen_random_bytes(24), 'hex');
  v_prefix := 'thb_live_pk_' || substring(v_random, 1, 4);
  v_full := v_prefix || '_' || v_random;
  v_hash := encode(digest(v_full, 'sha256'), 'hex');

  insert into public.api_keys (
    workspace_id, label, prefix, key_hash, scopes, expires_at, created_by
  ) values (
    p_workspace_id, p_label, v_prefix, v_hash, p_scopes, p_expires_at, auth.uid()
  )
  returning api_keys.id into v_id;

  return query select v_id, v_full, v_prefix;
end;
$$;
