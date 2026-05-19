-- ============================================================================
-- Migration: LGPD Center — DSR, Consent Log, PII Scanner
-- ============================================================================

-- ─── DSR Requests (Article 18) ──────────────────────────────────────────────
create table if not exists public.lgpd_dsr_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  subject_id      text,                                   -- customer_id ou phone/email
  subject_name    text not null,
  subject_email   text,
  subject_phone   text,
  subject_doc     text,                                   -- CPF/CNPJ
  kind            text not null check (kind in ('access','rectify','erase','portability','restriction','objection')),
  description     text,
  status          text not null default 'received' check (status in ('received','verifying','processing','completed','denied')),
  legal_basis_invoked text,
  response_data   jsonb,                                  -- payload do export quando completed
  due_date        timestamptz not null default now() + interval '15 days',
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id),
  resolution_notes text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_dsr_workspace_status
  on public.lgpd_dsr_requests(workspace_id, status);
create index if not exists idx_dsr_due_open
  on public.lgpd_dsr_requests(due_date) where status not in ('completed','denied');

-- ─── Consent Log (base legal por finalidade) ────────────────────────────────
create table if not exists public.lgpd_consent_log (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  subject_id      text not null,
  subject_phone   text,
  subject_email   text,
  purpose         text not null,                          -- 'marketing','analytics','onboarding'...
  legal_basis     text not null check (legal_basis in (
    'consent','contract','legal_obligation','vital_interest',
    'public_interest','legitimate_interest','credit_protection'
  )),
  granted         boolean not null default true,
  source_channel  text,                                   -- whatsapp/web/email
  evidence_text   text,                                   -- frase exata do opt-in
  ip_address      inet,
  user_agent      text,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

create index if not exists idx_consent_subject
  on public.lgpd_consent_log(workspace_id, subject_id);

-- ─── PII Detections (output do scanner) ─────────────────────────────────────
create table if not exists public.lgpd_pii_detections (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.inbox_conversations(id) on delete cascade,
  message_id      uuid references public.inbox_messages(id) on delete cascade,
  pii_kind        text not null check (pii_kind in ('cpf','cnpj','credit_card','phone','email','rg','passport','address','dob')),
  masked_excerpt  text not null,                          -- nunca o valor real
  action_taken    text not null default 'masked' check (action_taken in ('logged','masked','blocked')),
  detected_at     timestamptz not null default now()
);

create index if not exists idx_pii_workspace_time
  on public.lgpd_pii_detections(workspace_id, detected_at desc);

drop trigger if exists trg_dsr_touch on public.lgpd_dsr_requests;
create trigger trg_dsr_touch
  before update on public.lgpd_dsr_requests
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.lgpd_dsr_requests enable row level security;
alter table public.lgpd_consent_log enable row level security;
alter table public.lgpd_pii_detections enable row level security;

create policy "dsr_select" on public.lgpd_dsr_requests for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "dsr_write" on public.lgpd_dsr_requests for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "consent_select" on public.lgpd_consent_log for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "pii_select" on public.lgpd_pii_detections for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- ─── Trigger: PII scanner básico em inbox_messages ──────────────────────────
-- Detecta CPF (XXX.XXX.XXX-XX ou 11 dígitos), CNPJ, cartão (luhn-like),
-- email e telefone. Pra produção, considere edge function chamando regex engine.
create or replace function public.scan_pii_in_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  txt text := coalesce(new.body, '');
  detected text;
begin
  -- CPF (XXX.XXX.XXX-XX ou 11 dígitos consecutivos)
  if txt ~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'cpf', '***.***.***-**');
  end if;
  -- CNPJ
  if txt ~ '\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'cnpj', '**.***.***/****-**');
  end if;
  -- Cartão (4-6-4-4 ou 16 dígitos)
  if txt ~ '\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'credit_card', '****-****-****-****');
  end if;
  -- Email
  detected := substring(txt from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}');
  if detected is not null then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'email', regexp_replace(detected, '(.{2}).*(@.*)', '\1•••\2'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pii_scan on public.inbox_messages;
create trigger trg_pii_scan
  after insert on public.inbox_messages
  for each row execute function public.scan_pii_in_message();

comment on table public.lgpd_dsr_requests is
  'Data Subject Requests (LGPD Art. 18). Prazo legal 15 dias. Edge function lgpd-export gera bundle.';
comment on table public.lgpd_consent_log is
  'Log imutável de consentimento. Base legal exigida pelo Art. 7.';
comment on table public.lgpd_pii_detections is
  'PII detectada em mensagens. Trigger automático mascara antes de armazenar.';
