-- ============================================================================
-- Migration: thribus-platform — todas as features num shot
-- ============================================================================
-- Adaptada pra Supabase existente do bot Bianca:
--   - workspace_id é TEXT (não UUID)
--   - agent_id é TEXT (não UUID)
--   - membros via user_workspaces (não workspace_members)
--   - auth.uid() (Supabase Auth padrão)
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- Helper genérico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ─── INBOX ──────────────────────────────────────────────────────────────────
create table if not exists public.inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  external_id text not null,
  channel text not null check (channel in ('whatsapp','email','phone','web','instagram')),
  status text not null default 'open' check (status in ('open','pending','escalated','closed')),
  customer_id text, customer_name text, customer_phone text, customer_email text,
  assigned_agent_id text references public.agents(id) on delete set null,
  last_preview text, last_sentiment numeric(3,2) default 0,
  unread_count integer not null default 0,
  tags text[] default '{}'::text[], metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index if not exists idx_inbox_conv_workspace_activity on public.inbox_conversations(workspace_id, last_activity_at desc);
create index if not exists idx_inbox_conv_status on public.inbox_conversations(workspace_id, status) where status != 'closed';

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.inbox_conversations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  external_id text, channel text not null, direction text not null check (direction in ('in','out')),
  sender_name text not null, sender_id text, body text,
  is_bot boolean not null default false,
  attachments jsonb default '[]'::jsonb, metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_inbox_msg_conversation on public.inbox_messages(conversation_id, created_at desc);

create or replace function public.update_inbox_conversation_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.inbox_conversations
  set last_activity_at = new.created_at,
      last_preview = left(coalesce(new.body, ''), 200),
      unread_count = case when new.direction = 'in' then unread_count + 1 else unread_count end,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end; $$;
drop trigger if exists trg_inbox_msg_update_conversation on public.inbox_messages;
create trigger trg_inbox_msg_update_conversation after insert on public.inbox_messages
  for each row execute function public.update_inbox_conversation_on_message();

drop trigger if exists trg_inbox_conv_touch on public.inbox_conversations;
create trigger trg_inbox_conv_touch before update on public.inbox_conversations
  for each row execute function public.touch_updated_at();

-- ─── CUSTOMER 360 ───────────────────────────────────────────────────────────
create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  external_id text, name text not null,
  phone text, email text, document text, city text, state text,
  stage text default 'novo' check (stage in ('novo','qualificado','em_negociacao','cliente','churn')),
  temperature text default 'morno' check (temperature in ('frio','morno','quente')),
  score integer default 50 check (score between 0 and 100),
  ltv numeric(12,2) default 0, total_spent numeric(12,2) default 0,
  sentiment_trend numeric(3,2) default 0, tags text[] default '{}'::text[],
  owner_agent_id text references public.agents(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);

create table if not exists public.customer_facts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('agent','crm','rag','manual')),
  category text not null check (category in ('preference','context','objection','milestone')),
  fact text not null,
  confidence numeric(3,2) default 0.8,
  captured_by text,
  captured_at timestamptz not null default now()
);

create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  channel text not null, agent_name text, summary text not null,
  sentiment numeric(3,2) default 0,
  conversation_id uuid references public.inbox_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  external_id text, product text not null,
  status text not null check (status in ('ativo','cancelado','pendente','suspenso')),
  mrr numeric(10,2) not null default 0,
  started_at timestamptz, ends_at timestamptz, metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_cp_touch on public.customer_profiles;
create trigger trg_cp_touch before update on public.customer_profiles
  for each row execute function public.touch_updated_at();

-- ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('system','approval','alert','mention','workflow','billing','announcement')),
  title text not null, body text, href text, source text,
  read boolean not null default false, metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_workspace on public.notifications(workspace_id, created_at desc);

-- ─── KNOWLEDGE (pgvector) ───────────────────────────────────────────────────
create table if not exists public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null, description text,
  embedding_model text not null default 'text-embedding-3-small',
  chunk_size integer not null default 800, chunk_overlap integer not null default 120,
  visibility text not null default 'workspace',
  attached_agent_ids text[] default '{}'::text[],
  total_chunks integer not null default 0, total_tokens integer not null default 0,
  size_mb numeric(10,2) not null default 0, query_count_30d integer not null default 0,
  last_query_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('pdf','url','sheet','notion','gdrive','text')),
  title text not null, uri text not null,
  status text not null default 'idle' check (status in ('idle','ingesting','ready','failed','stale')),
  chunks_count integer not null default 0, tokens integer not null default 0,
  error text, last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  chunk_index integer not null, content text not null,
  tokens integer not null default 0,
  embedding vector(1536), metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_kchunks_embedding on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists public.knowledge_queries (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  query text not null, top_k integer not null default 4,
  hits integer not null default 0, latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.match_knowledge_chunks(
  base_uuid uuid, query_embedding vector(1536),
  match_count integer default 4, min_similarity float default 0.0
) returns table (id uuid, source_id uuid, content text, similarity float, tokens integer)
language sql stable as $$
  select c.id, c.source_id, c.content,
    1 - (c.embedding <=> query_embedding) as similarity, c.tokens
  from public.knowledge_chunks c
  where c.base_id = base_uuid
    and (1 - (c.embedding <=> query_embedding)) > min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── WEBHOOKS OUTBOUND ──────────────────────────────────────────────────────
create table if not exists public.outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  label text not null, url text not null,
  events text[] not null default '{}'::text[],
  secret text not null, active boolean not null default true,
  success_count integer not null default 0, failure_count integer not null default 0,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.outbound_webhooks(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  event text not null, url text not null, payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','success','failed','retrying')),
  http_code integer, attempt_count integer not null default 0,
  latency_ms integer not null default 0,
  next_attempt_at timestamptz, error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_wd_pending on public.webhook_deliveries(workspace_id, next_attempt_at) where status in ('pending','retrying');

drop trigger if exists trg_ow_touch on public.outbound_webhooks;
create trigger trg_ow_touch before update on public.outbound_webhooks
  for each row execute function public.touch_updated_at();

-- ─── VAULT ──────────────────────────────────────────────────────────────────
create table if not exists public.workspace_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  key text not null,
  category text not null check (category in ('crm','erp','payment','comms','analytics','custom')),
  value_encrypted bytea not null, masked_value text not null,
  rotates_every_days integer, last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  label text not null, prefix text not null,
  key_hash text not null unique, scopes text[] not null default '{}'::text[],
  last_used_at timestamptz, expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.vault_encrypt(plaintext text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(plaintext, current_setting('app.vault_key', true));
$$;

create or replace function public.upsert_workspace_secret(
  p_workspace_id text, p_key text, p_category text,
  p_value text, p_masked text, p_rotates_every_days integer default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into public.workspace_secrets (workspace_id, key, category, value_encrypted, masked_value, rotates_every_days)
  values (p_workspace_id, p_key, p_category, public.vault_encrypt(p_value), p_masked, p_rotates_every_days)
  on conflict (workspace_id, key) do update set
    category=excluded.category, value_encrypted=excluded.value_encrypted,
    masked_value=excluded.masked_value, rotates_every_days=excluded.rotates_every_days,
    updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

-- ─── LGPD ───────────────────────────────────────────────────────────────────
create table if not exists public.lgpd_dsr_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  subject_id text, subject_name text not null,
  subject_email text, subject_phone text, subject_doc text,
  kind text not null check (kind in ('access','rectify','erase','portability','restriction','objection')),
  description text,
  status text not null default 'received' check (status in ('received','verifying','processing','completed','denied')),
  legal_basis_invoked text, response_data jsonb,
  due_date timestamptz not null default now() + interval '15 days',
  resolved_at timestamptz, resolved_by uuid references auth.users(id),
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lgpd_consent_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  subject_id text not null, subject_phone text, subject_email text,
  purpose text not null,
  legal_basis text not null,
  granted boolean not null default true,
  source_channel text, evidence_text text,
  ip_address inet, user_agent text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.lgpd_pii_detections (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.inbox_conversations(id) on delete cascade,
  message_id uuid references public.inbox_messages(id) on delete cascade,
  pii_kind text not null check (pii_kind in ('cpf','cnpj','credit_card','phone','email','rg','passport','address','dob')),
  masked_excerpt text not null,
  action_taken text not null default 'masked' check (action_taken in ('logged','masked','blocked')),
  detected_at timestamptz not null default now()
);

create or replace function public.scan_pii_in_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare txt text := coalesce(new.body, '');
begin
  if txt ~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'cpf', '***.***.***-**');
  end if;
  if txt ~ '\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'cnpj', '**.***.***/****-**');
  end if;
  if txt ~ '\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}' then
    insert into public.lgpd_pii_detections (workspace_id, conversation_id, message_id, pii_kind, masked_excerpt)
    values (new.workspace_id, new.conversation_id, new.id, 'credit_card', '****-****-****-****');
  end if;
  return new;
end; $$;
drop trigger if exists trg_pii_scan on public.inbox_messages;
create trigger trg_pii_scan after insert on public.inbox_messages
  for each row execute function public.scan_pii_in_message();

-- ─── EXPERIMENTS ────────────────────────────────────────────────────────────
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  name text not null, hypothesis text,
  primary_metric text not null check (primary_metric in ('conversion','csat','first_response','resolution_rate')),
  status text not null default 'draft' check (status in ('draft','running','concluded','archived')),
  winner text, significance numeric(4,3) default 0,
  duration_days integer not null default 7,
  started_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  label text not null,
  prompt_version_id text, prompt_version_label text,
  traffic_share integer not null default 50,
  created_at timestamptz not null default now(),
  unique (experiment_id, label)
);

create table if not exists public.experiment_exposures (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_id uuid not null references public.experiment_variants(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.inbox_conversations(id) on delete cascade,
  execution_id text,
  success boolean, latency_ms integer, cost_usd numeric(10,5),
  created_at timestamptz not null default now()
);

create or replace view public.experiment_variant_stats as
select v.experiment_id, v.id as variant_id, v.label,
  v.prompt_version_label, v.traffic_share,
  count(e.*) as exposures,
  count(e.*) filter (where e.success = true) as successes,
  coalesce(avg(case when e.success then 1.0 else 0.0 end), 0)::numeric(4,3) as conversion_rate,
  coalesce(avg(e.latency_ms), 0)::integer as avg_latency_ms,
  coalesce(avg(e.cost_usd), 0)::numeric(10,5) as avg_cost
from public.experiment_variants v
left join public.experiment_exposures e on e.variant_id = v.id
group by v.experiment_id, v.id, v.label, v.prompt_version_label, v.traffic_share;

-- ─── STUDIO ─────────────────────────────────────────────────────────────────
create table if not exists public.studio_canvases (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  name text not null, description text,
  blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz, published_version integer not null default 0,
  author uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── VOICE ──────────────────────────────────────────────────────────────────
create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  external_id text,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null check (status in ('ringing','in_progress','completed','failed','voicemail')),
  customer_name text, customer_phone text not null,
  duration_sec integer not null default 0, cost_usd numeric(10,4) not null default 0,
  recording_url text, transcript text,
  sentiment numeric(3,2) default 0, tools_called text[] default '{}'::text[],
  outcome text,
  started_at timestamptz not null default now(), ended_at timestamptz
);

-- ─── MARKETPLACE ────────────────────────────────────────────────────────────
create table if not exists public.marketplace_publishers (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null, verified boolean not null default false,
  rating numeric(3,2) default 0,
  total_revenue_brl numeric(12,2) default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.marketplace_publishers(id) on delete cascade,
  type text not null check (type in ('skill','template','integration','workflow')),
  title text not null, slug text not null unique,
  description text, category text, icon text, logo_slug text,
  pricing text not null check (pricing in ('free','paid','subscription','revshare')),
  price_monthly numeric(10,2),
  rating numeric(3,2) default 0, reviews_count integer not null default 0,
  installs integer not null default 0, installs_30d integer not null default 0,
  featured boolean not null default false, trending boolean not null default false,
  version text not null default '1.0.0',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_installs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  installed_at timestamptz not null default now(),
  active boolean not null default true,
  unique (workspace_id, listing_id)
);

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  author_name text not null,
  author_workspace_id text references public.workspaces(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  body text not null, helpful integer not null default 0,
  publisher_reply text, publisher_replied_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── SANDBOX ────────────────────────────────────────────────────────────────
create table if not exists public.sandbox_trials (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  company_name text not null, industry text not null, owner_email text not null,
  synthetic_data_loaded boolean not null default false,
  conversations_tested integer not null default 0,
  agents_created integer not null default 0,
  converted_to_paid boolean not null default false, converted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ─── INSIGHTS / VoC ─────────────────────────────────────────────────────────
create table if not exists public.daily_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  insight_date date not null,
  kind text not null check (kind in ('top_objection','rising_intent','agent_alert','cost_anomaly','opportunity')),
  title text not null, body text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  metric_value numeric, reference_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.voc_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  theme text not null,
  category text not null check (category in ('pain','wish','praise','question','complaint')),
  mentions integer not null default 0, sentiment_avg numeric(3,2),
  sample_quote text, trend_7d numeric(5,2),
  last_seen_at timestamptz not null default now(),
  unique (workspace_id, theme)
);

-- ─── REPORTS ────────────────────────────────────────────────────────────────
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  channels text[] not null default '{email}'::text[],
  recipients text[] not null default '{}'::text[],
  sections text[] not null default '{}'::text[],
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.report_schedules(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  generated_at timestamptz not null default now(),
  status text not null check (status in ('sent','failed','preview')),
  recipients_count integer not null default 0,
  highlights jsonb default '[]'::jsonb,
  kpis jsonb default '[]'::jsonb,
  alerts jsonb default '[]'::jsonb
);

-- ─── ONBOARDING ─────────────────────────────────────────────────────────────
create table if not exists public.onboarding_progress (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  steps_completed text[] not null default '{}'::text[],
  current_step integer not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ─── STATUS ─────────────────────────────────────────────────────────────────
create table if not exists public.status_components (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  status text not null default 'operational',
  uptime_30d_pct numeric(5,3) default 100, sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.status_incidents (
  id uuid primary key default gen_random_uuid(),
  component_id uuid references public.status_components(id) on delete set null,
  title text not null, description text,
  severity text not null default 'minor',
  status text not null default 'investigating',
  started_at timestamptz not null default now(),
  resolved_at timestamptz, updates jsonb default '[]'::jsonb
);

-- ─── HELP / ACADEMY ─────────────────────────────────────────────────────────
create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, category text not null,
  body text not null, read_time_min integer not null default 5,
  views integer not null default 0, helpful_count integer not null default 0,
  published boolean not null default false, published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, description text,
  duration_min integer not null default 30,
  level text not null check (level in ('iniciante','intermediario','avancado')),
  modules jsonb default '[]'::jsonb, certification boolean not null default false,
  enrollments integer not null default 0, completions integer not null default 0,
  published boolean not null default false
);

create table if not exists public.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  progress_pct integer not null default 0,
  completed_at timestamptz, certificate_url text,
  enrolled_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ─── MOBILE / PUSH ──────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth_key text not null,
  device_label text, user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  quiet_hours_start time, quiet_hours_end time,
  kinds_muted text[] not null default '{}'::text[],
  primary key (user_id, workspace_id)
);

-- ─── PARTNERS ───────────────────────────────────────────────────────────────
create table if not exists public.partner_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null, email text not null,
  tier text not null default 'silver' check (tier in ('silver','gold','platinum')),
  commission_rate numeric(4,3) not null default 0.20,
  referral_code text not null unique,
  leads_count integer not null default 0, conversions integer not null default 0,
  total_revenue_brl numeric(12,2) not null default 0,
  total_commission_brl numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ─── RPCs auxiliares ────────────────────────────────────────────────────────
create or replace function public.complete_onboarding_step(
  p_workspace_id text, p_step text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.onboarding_progress (workspace_id, steps_completed, current_step)
  values (p_workspace_id, array[p_step], 2)
  on conflict (workspace_id) do update set
    steps_completed = case when p_step = any(onboarding_progress.steps_completed)
      then onboarding_progress.steps_completed
      else array_append(onboarding_progress.steps_completed, p_step) end,
    current_step = least(onboarding_progress.current_step + 1, 5),
    updated_at = now();
end; $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Workspace-aware (via user_workspaces). Service role bypassa RLS.
alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_facts enable row level security;
alter table public.customer_interactions enable row level security;
alter table public.customer_contracts enable row level security;
alter table public.notifications enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_queries enable row level security;
alter table public.outbound_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.workspace_secrets enable row level security;
alter table public.api_keys enable row level security;
alter table public.lgpd_dsr_requests enable row level security;
alter table public.lgpd_consent_log enable row level security;
alter table public.lgpd_pii_detections enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_variants enable row level security;
alter table public.experiment_exposures enable row level security;
alter table public.studio_canvases enable row level security;
alter table public.voice_calls enable row level security;
alter table public.marketplace_installs enable row level security;
alter table public.sandbox_trials enable row level security;
alter table public.daily_insights enable row level security;
alter table public.voc_themes enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_runs enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.partner_accounts enable row level security;
alter table public.academy_enrollments enable row level security;

-- Helper macro inline (SQL não tem macro, então policy duplicada por tabela)
do $$
declare t text;
begin
  for t in select unnest(array[
    'inbox_conversations','inbox_messages',
    'customer_profiles','customer_facts','customer_interactions','customer_contracts',
    'notifications','knowledge_bases','knowledge_sources','knowledge_chunks','knowledge_queries',
    'outbound_webhooks','webhook_deliveries','workspace_secrets','api_keys',
    'lgpd_dsr_requests','lgpd_consent_log','lgpd_pii_detections',
    'experiments','experiment_exposures','studio_canvases','voice_calls',
    'marketplace_installs','sandbox_trials','daily_insights','voc_themes',
    'report_schedules','report_runs','onboarding_progress','partner_accounts'
  ])
  loop
    execute format($p$
      drop policy if exists "%I_workspace_select" on public.%I;
      create policy "%I_workspace_select" on public.%I for select using (
        workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
      );
    $p$, t, t, t, t);
  end loop;
end $$;

-- Tabelas públicas (read sem auth)
alter table public.marketplace_publishers enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.status_components enable row level security;
alter table public.status_incidents enable row level security;
alter table public.kb_articles enable row level security;
alter table public.academy_courses enable row level security;

create policy "mkt_publishers_public" on public.marketplace_publishers for select using (true);
create policy "mkt_listings_public" on public.marketplace_listings for select using (true);
create policy "mkt_reviews_public" on public.marketplace_reviews for select using (true);
create policy "status_components_public" on public.status_components for select using (true);
create policy "status_incidents_public" on public.status_incidents for select using (true);
create policy "kb_articles_public" on public.kb_articles for select using (published = true);
create policy "academy_courses_public" on public.academy_courses for select using (published = true);

-- Variant policy via JOIN
create policy "exp_variants_select" on public.experiment_variants for select using (
  experiment_id in (
    select id from public.experiments
    where workspace_id in (select workspace_id from public.user_workspaces where user_id = auth.uid())
  )
);

-- Push/Notif prefs por user
create policy "push_subs_own" on public.push_subscriptions for all using (user_id = auth.uid());
create policy "notif_prefs_own" on public.notification_preferences for all using (user_id = auth.uid());
create policy "enrollments_own" on public.academy_enrollments for all using (user_id = auth.uid());
