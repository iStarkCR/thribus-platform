-- ============================================================================
-- Migration: Round 3 — 12 features restantes (Voice, Marketplace, Sandbox,
-- Insights, Reports, Onboarding, Status, Help, Mobile, Partners, Studio aux)
-- ============================================================================

-- ─── 1. Voice (Vapi / ElevenLabs) ───────────────────────────────────────────
create table if not exists public.voice_providers_config (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  provider        text not null check (provider in ('elevenlabs','vapi','azure')),
  voice_id        text not null,
  voice_name      text not null,
  language        text not null default 'pt-BR',
  tts_model       text,
  stt_model       text,
  inbound_number  text,
  outbound_from   text,
  greeting        text not null default 'Olá! Em que posso ajudar?',
  max_duration_min integer not null default 12,
  record_calls    boolean not null default true,
  transcribe_calls boolean not null default true,
  fallback_to_human boolean not null default true,
  updated_at      timestamptz not null default now()
);

create table if not exists public.voice_calls (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  external_id     text,
  direction       text not null check (direction in ('inbound','outbound')),
  status          text not null check (status in ('ringing','in_progress','completed','failed','voicemail')),
  customer_name   text,
  customer_phone  text not null,
  duration_sec    integer not null default 0,
  cost_usd        numeric(10,4) not null default 0,
  recording_url   text,
  transcript      text,
  sentiment       numeric(3,2) default 0,
  tools_called    text[] default '{}'::text[],
  outcome         text check (outcome in ('venda','follow_up','sem_interesse','escalado','caixa_postal','tecnico')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index if not exists idx_voice_calls_workspace_time
  on public.voice_calls(workspace_id, started_at desc);

-- ─── 2. Marketplace plataforma ──────────────────────────────────────────────
create table if not exists public.marketplace_publishers (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  verified        boolean not null default false,
  rating          numeric(3,2) default 0,
  total_revenue_brl numeric(12,2) default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id              uuid primary key default gen_random_uuid(),
  publisher_id    uuid not null references public.marketplace_publishers(id) on delete cascade,
  type            text not null check (type in ('skill','template','integration','workflow')),
  title           text not null,
  slug            text not null unique,
  description     text,
  category        text,
  icon            text,
  logo_slug       text,
  pricing         text not null check (pricing in ('free','paid','subscription','revshare')),
  price_monthly   numeric(10,2),
  rating          numeric(3,2) default 0,
  reviews_count   integer not null default 0,
  installs        integer not null default 0,
  installs_30d    integer not null default 0,
  featured        boolean not null default false,
  trending        boolean not null default false,
  version         text not null default '1.0.0',
  published_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_mkt_listings_category on public.marketplace_listings(category);
create index if not exists idx_mkt_listings_trending on public.marketplace_listings(installs_30d desc);

create table if not exists public.marketplace_installs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  listing_id      uuid not null references public.marketplace_listings(id) on delete cascade,
  installed_at    timestamptz not null default now(),
  active          boolean not null default true,
  unique (workspace_id, listing_id)
);

create table if not exists public.marketplace_reviews (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.marketplace_listings(id) on delete cascade,
  author_name     text not null,
  author_workspace_id uuid references public.workspaces(id) on delete set null,
  rating          integer not null check (rating between 1 and 5),
  body            text not null,
  helpful         integer not null default 0,
  publisher_reply text,
  publisher_replied_at timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_mkt_reviews_listing on public.marketplace_reviews(listing_id);

-- Trigger atualiza counters da listing
create or replace function public.refresh_listing_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.marketplace_listings set
    installs = (select count(*) from public.marketplace_installs where listing_id = new.listing_id and active),
    installs_30d = (select count(*) from public.marketplace_installs where listing_id = new.listing_id and installed_at >= now() - interval '30 days'),
    updated_at = now()
  where id = new.listing_id;
  return new;
end;
$$;
drop trigger if exists trg_mkt_installs_stats on public.marketplace_installs;
create trigger trg_mkt_installs_stats
  after insert or update on public.marketplace_installs
  for each row execute function public.refresh_listing_stats();

-- ─── 3. Sandbox / Trial ─────────────────────────────────────────────────────
create table if not exists public.sandbox_trials (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  company_name    text not null,
  industry        text not null,
  owner_email     text not null,
  synthetic_data_loaded boolean not null default false,
  conversations_tested integer not null default 0,
  agents_created  integer not null default 0,
  converted_to_paid boolean not null default false,
  converted_at    timestamptz,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_trials_workspace on public.sandbox_trials(workspace_id);
create index if not exists idx_trials_expiring
  on public.sandbox_trials(expires_at)
  where converted_to_paid = false;

-- ─── 4. Insights / VoC ──────────────────────────────────────────────────────
create table if not exists public.daily_insights (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  insight_date    date not null,
  kind            text not null check (kind in ('top_objection','rising_intent','agent_alert','cost_anomaly','opportunity')),
  title           text not null,
  body            text not null,
  severity        text not null default 'info' check (severity in ('info','warning','critical')),
  metric_value    numeric,
  reference_url   text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_daily_insights_workspace
  on public.daily_insights(workspace_id, insight_date desc);

create table if not exists public.voc_themes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  theme           text not null,
  category        text not null check (category in ('pain','wish','praise','question','complaint')),
  mentions        integer not null default 0,
  sentiment_avg   numeric(3,2),
  sample_quote    text,
  trend_7d        numeric(5,2),
  last_seen_at    timestamptz not null default now()
);
create index if not exists idx_voc_workspace_mentions
  on public.voc_themes(workspace_id, mentions desc);

-- ─── 5. Reports executivos ──────────────────────────────────────────────────
create table if not exists public.report_schedules (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  frequency       text not null check (frequency in ('daily','weekly','monthly')),
  channels        text[] not null default '{email}'::text[],
  recipients      text[] not null default '{}'::text[],
  sections        text[] not null default '{}'::text[],
  enabled         boolean not null default true,
  next_run_at     timestamptz not null,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.report_runs (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references public.report_schedules(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  generated_at    timestamptz not null default now(),
  status          text not null check (status in ('sent','failed','preview')),
  recipients_count integer not null default 0,
  highlights      jsonb default '[]'::jsonb,
  kpis            jsonb default '[]'::jsonb,
  alerts          jsonb default '[]'::jsonb
);
create index if not exists idx_report_runs_workspace_time
  on public.report_runs(workspace_id, generated_at desc);

-- ─── 6. Onboarding ──────────────────────────────────────────────────────────
create table if not exists public.onboarding_progress (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  steps_completed text[] not null default '{}'::text[],
  current_step    integer not null default 1,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now()
);

-- ─── 7. Status page ─────────────────────────────────────────────────────────
create table if not exists public.status_components (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  status          text not null default 'operational' check (status in (
    'operational','degraded_performance','partial_outage','major_outage','maintenance'
  )),
  uptime_30d_pct  numeric(5,3) default 100,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table if not exists public.status_incidents (
  id              uuid primary key default gen_random_uuid(),
  component_id    uuid references public.status_components(id) on delete set null,
  title           text not null,
  description     text,
  severity        text not null default 'minor' check (severity in ('minor','major','critical')),
  status          text not null default 'investigating' check (status in (
    'investigating','identified','monitoring','resolved'
  )),
  started_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  updates         jsonb default '[]'::jsonb
);

-- ─── 8. Help / Academy ──────────────────────────────────────────────────────
create table if not exists public.kb_articles (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  category        text not null,
  body            text not null,
  read_time_min   integer not null default 5,
  views           integer not null default 0,
  helpful_count   integer not null default 0,
  published       boolean not null default false,
  published_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create table if not exists public.academy_courses (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text,
  duration_min    integer not null default 30,
  level           text not null check (level in ('iniciante','intermediario','avancado')),
  modules         jsonb default '[]'::jsonb,
  certification   boolean not null default false,
  enrollments     integer not null default 0,
  completions     integer not null default 0,
  published       boolean not null default false
);

create table if not exists public.academy_enrollments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  course_id       uuid not null references public.academy_courses(id) on delete cascade,
  progress_pct    integer not null default 0 check (progress_pct between 0 and 100),
  completed_at    timestamptz,
  certificate_url text,
  enrolled_at     timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ─── 9. Mobile / PWA — device tokens + push subscriptions ──────────────────
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,                          -- chave pública Web Push
  auth_key        text not null,
  device_label    text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notification_preferences (
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  email_enabled   boolean not null default true,
  push_enabled    boolean not null default true,
  whatsapp_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  kinds_muted     text[] not null default '{}'::text[],
  primary key (user_id, workspace_id)
);

-- ─── 10. Partners portal ───────────────────────────────────────────────────
create table if not exists public.partner_accounts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  email           text not null,
  tier            text not null default 'silver' check (tier in ('silver','gold','platinum')),
  commission_rate numeric(4,3) not null default 0.20,
  referral_code   text not null unique,
  leads_count     integer not null default 0,
  conversions     integer not null default 0,
  total_revenue_brl numeric(12,2) not null default 0,
  total_commission_brl numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.partner_leads (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partner_accounts(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  lead_email      text not null,
  lead_company    text,
  status          text not null default 'novo' check (status in (
    'novo','contato','demo','negociacao','convertido','perdido'
  )),
  deal_value_brl  numeric(12,2),
  commission_brl  numeric(12,2),
  converted_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ─── 11. Profile (uses auth.users.raw_user_meta_data — no extra table) ─────
-- Apenas adicionar comentário; já é nativo do Supabase Auth.

-- ─── 12. Studio drag-and-drop helpers ──────────────────────────────────────
-- Já tem studio_canvases. Não precisa migration nova — drag-and-drop é frontend.

-- ─── RLS — todas as tabelas ─────────────────────────────────────────────────
alter table public.voice_providers_config enable row level security;
alter table public.voice_calls enable row level security;
alter table public.marketplace_publishers enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_installs enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.sandbox_trials enable row level security;
alter table public.daily_insights enable row level security;
alter table public.voc_themes enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_runs enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.status_components enable row level security;
alter table public.status_incidents enable row level security;
alter table public.kb_articles enable row level security;
alter table public.academy_courses enable row level security;
alter table public.academy_enrollments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.partner_accounts enable row level security;
alter table public.partner_leads enable row level security;

-- Voice
create policy "voice_config_select" on public.voice_providers_config for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "voice_calls_select" on public.voice_calls for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Marketplace (público pra read em listings/publishers; install/review com auth)
create policy "mkt_publishers_select" on public.marketplace_publishers for select using (true);
create policy "mkt_listings_select" on public.marketplace_listings for select using (true);
create policy "mkt_reviews_select" on public.marketplace_reviews for select using (true);
create policy "mkt_installs_select" on public.marketplace_installs for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "mkt_installs_write" on public.marketplace_installs for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Sandbox
create policy "trials_select" on public.sandbox_trials for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Insights/VoC
create policy "insights_select" on public.daily_insights for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "voc_select" on public.voc_themes for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Reports
create policy "reports_schedules_select" on public.report_schedules for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "reports_schedules_write" on public.report_schedules for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "reports_runs_select" on public.report_runs for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Onboarding
create policy "onboarding_select" on public.onboarding_progress for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "onboarding_write" on public.onboarding_progress for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Status (público — statuspage)
create policy "status_components_select" on public.status_components for select using (true);
create policy "status_incidents_select" on public.status_incidents for select using (true);

-- KB / Academy (público)
create policy "kb_articles_select" on public.kb_articles for select using (published = true);
create policy "courses_select" on public.academy_courses for select using (published = true);
create policy "enrollments_select" on public.academy_enrollments for select
  using (user_id = auth.uid());
create policy "enrollments_write" on public.academy_enrollments for all
  using (user_id = auth.uid());

-- Push / Notif Prefs
create policy "push_select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push_write" on public.push_subscriptions for all using (user_id = auth.uid());
create policy "notif_prefs_select" on public.notification_preferences for select using (user_id = auth.uid());
create policy "notif_prefs_write" on public.notification_preferences for all using (user_id = auth.uid());

-- Partners
create policy "partners_select" on public.partner_accounts for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "partner_leads_select" on public.partner_leads for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Touch triggers
drop trigger if exists trg_voice_cfg_touch on public.voice_providers_config;
create trigger trg_voice_cfg_touch before update on public.voice_providers_config
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_mkt_listings_touch on public.marketplace_listings;
create trigger trg_mkt_listings_touch before update on public.marketplace_listings
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_onboarding_touch on public.onboarding_progress;
create trigger trg_onboarding_touch before update on public.onboarding_progress
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_status_components_touch on public.status_components;
create trigger trg_status_components_touch before update on public.status_components
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_kb_articles_touch on public.kb_articles;
create trigger trg_kb_articles_touch before update on public.kb_articles
  for each row execute function public.touch_updated_at();

-- ─── RPC: complete_onboarding_step ─────────────────────────────────────────
create or replace function public.complete_onboarding_step(
  p_workspace_id uuid,
  p_step text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.onboarding_progress (workspace_id, steps_completed, current_step)
  values (p_workspace_id, array[p_step], 2)
  on conflict (workspace_id) do update set
    steps_completed = case
      when p_step = any(onboarding_progress.steps_completed)
        then onboarding_progress.steps_completed
      else array_append(onboarding_progress.steps_completed, p_step)
    end,
    current_step = least(onboarding_progress.current_step + 1, 5),
    updated_at = now(),
    completed_at = case when array_length(array_append(onboarding_progress.steps_completed, p_step), 1) >= 5 then now() else onboarding_progress.completed_at end;
end;
$$;
