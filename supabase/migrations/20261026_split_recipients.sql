-- Split de pagamentos Asaas: cadastro de parceiros/terceiros que recebem uma
-- fatia da cobrança automaticamente (comissão de indicação, revenda white-label,
-- parceiro técnico). Cada parceiro mapeia pra uma `walletId` de conta Asaas.
--
-- O walletId é um identificador de conta Asaas destinatária. Obtê-lo é decisão
-- operacional do Charles: ou o parceiro já tem conta Asaas (informa a wallet),
-- ou a Thribus cria uma subconta via /accounts (exige KYC — fora desta migration).
--
-- Dado de controle financeiro interno da Thribus → só super-admin escreve/lê.
-- A Edge Function `asaas-proxy` lê via service_role (bypassa RLS) na hora de
-- montar o split. Idempotente — pode rodar via `supabase db push` ou SQL Editor.

create table if not exists public.split_recipients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  wallet_id          text not null,
  -- default aplicado quando a cobrança não especifica o valor do split.
  -- Exatamente um dos dois (ou nenhum, se o valor vier sempre explícito).
  default_percentual numeric(5,2),
  default_fixed_value numeric(12,2),
  active             boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint split_recipients_percentual_range
    check (default_percentual is null or (default_percentual > 0 and default_percentual <= 100)),
  constraint split_recipients_fixed_positive
    check (default_fixed_value is null or default_fixed_value > 0),
  constraint split_recipients_one_default
    check (not (default_percentual is not null and default_fixed_value is not null))
);

create unique index if not exists split_recipients_wallet_uniq
  on public.split_recipients (wallet_id);

create index if not exists split_recipients_active_idx
  on public.split_recipients (active) where active;

alter table public.split_recipients enable row level security;

drop policy if exists "split_recipients_admin_all" on public.split_recipients;
create policy "split_recipients_admin_all" on public.split_recipients
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
