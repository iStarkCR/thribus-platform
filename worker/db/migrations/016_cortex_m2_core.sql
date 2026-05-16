-- ══════════════════════════════════════════════════════
-- Migration 016 — Cortex M2 B2B Core (CRM + Tickets + Faturamento BR + KB)
-- ══════════════════════════════════════════════════════

-- ─── 1. CRM ──────────────────────────────────────────────────────────────
create table if not exists cortex_crm_leads (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  name            text not null,
  email           text,
  phone           text,
  company         text,
  source          text,
  status          text not null default 'new',
  -- BANT score
  budget_score    integer not null default 0,
  authority_score integer not null default 0,
  need_score      integer not null default 0,
  timeline_score  integer not null default 0,
  notes           text,
  owner_user_id   text references cortex_users(id),
  custom_fields   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cortex_crm_leads_tenant_idx on cortex_crm_leads(tenant_id, status, created_at desc);
create index if not exists cortex_crm_leads_email_idx on cortex_crm_leads(tenant_id, lower(email)) where email is not null;

create table if not exists cortex_crm_deals (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  lead_id         text references cortex_crm_leads(id) on delete set null,
  title           text not null,
  stage           text not null default 'lead',
  -- stages: lead | qualified | proposal | negotiation | won | lost
  value           numeric(14,2) not null default 0,
  currency        text not null default 'BRL',
  probability     integer not null default 50,
  expected_close  date,
  owner_user_id   text references cortex_users(id),
  notes           text,
  custom_fields   jsonb not null default '{}'::jsonb,
  closed_at       timestamptz,
  close_reason    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cortex_crm_deals_tenant_idx on cortex_crm_deals(tenant_id, stage, created_at desc);
create index if not exists cortex_crm_deals_owner_idx on cortex_crm_deals(tenant_id, owner_user_id) where owner_user_id is not null;

-- ─── 2. Tickets / Suporte ───────────────────────────────────────────────
create table if not exists cortex_tickets (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  number          serial,
  subject         text not null,
  body            text not null default '',
  status          text not null default 'open',
  -- open | pending | resolved | closed
  priority        text not null default 'normal',
  -- low|normal|high|urgent
  category        text,
  -- Customer
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  -- Atribuição
  assigned_user_id text references cortex_users(id),
  assigned_agent_id text,
  -- SLA
  sla_response_minutes integer,
  sla_resolution_minutes integer,
  first_response_at timestamptz,
  resolved_at     timestamptz,
  -- CSAT
  csat_score      integer,
  csat_comment    text,
  -- Origem (qual canal)
  source          text default 'manual',
  source_ref      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cortex_tickets_tenant_idx on cortex_tickets(tenant_id, status, priority, created_at desc);
create index if not exists cortex_tickets_assigned_idx on cortex_tickets(tenant_id, assigned_user_id) where assigned_user_id is not null;

create table if not exists cortex_ticket_messages (
  id              bigserial primary key,
  ticket_id       text not null references cortex_tickets(id) on delete cascade,
  tenant_id       text not null,
  author_id       text references cortex_users(id),
  agent_id        text,
  is_internal     boolean not null default false,
  body            text not null,
  attachments     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_ticket_messages_ticket_idx on cortex_ticket_messages(ticket_id, created_at);

-- ─── 3. Faturamento BR ──────────────────────────────────────────────────
create table if not exists cortex_billing_invoices (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  -- Cliente
  customer_name   text not null,
  customer_document text,
  customer_email  text,
  -- Fatura
  number          text,
  description     text not null,
  amount          numeric(14,2) not null,
  currency        text not null default 'BRL',
  -- Status
  status          text not null default 'draft',
  -- draft | pending | paid | overdue | canceled | refunded
  due_date        date not null,
  paid_at         timestamptz,
  -- Métodos
  payment_method  text,                   -- 'boleto'|'pix'|'card'|'transfer'
  pix_qrcode      text,
  boleto_url      text,
  boleto_barcode  text,
  -- Provider externo (Asaas, Pagar.me, Stripe BR)
  provider        text,
  provider_id     text,
  -- Nota fiscal
  nfe_number      text,
  nfe_url         text,
  nfe_status      text,
  -- Items
  items           jsonb not null default '[]'::jsonb,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cortex_billing_invoices_tenant_idx on cortex_billing_invoices(tenant_id, status, due_date);
create index if not exists cortex_billing_invoices_overdue_idx on cortex_billing_invoices(tenant_id, due_date) where status = 'overdue' or (status = 'pending' and due_date < now());

create table if not exists cortex_billing_dunning (
  id              bigserial primary key,
  invoice_id      text not null references cortex_billing_invoices(id) on delete cascade,
  tenant_id       text not null,
  stage           text not null,
  -- 'pre_due_3d'|'due_today'|'overdue_5d'|'overdue_15d'|'collection'
  attempt         integer not null default 1,
  channel         text not null,
  -- 'email'|'whatsapp'|'sms'
  message         text,
  status          text not null default 'pending',
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists cortex_billing_dunning_invoice_idx on cortex_billing_dunning(invoice_id);

-- ─── 4. Knowledge Base ──────────────────────────────────────────────────
create table if not exists cortex_kb_folders (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  parent_id       text references cortex_kb_folders(id) on delete cascade,
  name            text not null,
  icon            text,
  -- Permissões
  visibility      text not null default 'team',
  -- 'private'|'team'|'public'
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now()
);
create index if not exists cortex_kb_folders_tenant_idx on cortex_kb_folders(tenant_id, parent_id);

create table if not exists cortex_kb_docs (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references cortex_tenants(id) on delete cascade,
  folder_id       text references cortex_kb_folders(id) on delete set null,
  title           text not null,
  body_md         text not null default '',
  -- Versionamento
  version         integer not null default 1,
  -- Permissões
  visibility      text not null default 'team',
  -- Tags
  tags            text[] not null default '{}',
  -- Sincronia
  source          text,
  source_id       text,
  -- Tracking
  view_count      integer not null default 0,
  last_edited_by  text references cortex_users(id),
  last_edited_at  timestamptz default now(),
  created_by      text references cortex_users(id),
  created_at      timestamptz not null default now()
);
create index if not exists cortex_kb_docs_tenant_idx on cortex_kb_docs(tenant_id, folder_id, last_edited_at desc);
create index if not exists cortex_kb_docs_tags_idx on cortex_kb_docs using gin(tags);

create table if not exists cortex_kb_doc_versions (
  id              bigserial primary key,
  doc_id          text not null references cortex_kb_docs(id) on delete cascade,
  tenant_id       text not null,
  version         integer not null,
  body_md         text not null,
  edited_by       text references cortex_users(id),
  edited_at       timestamptz not null default now()
);
create index if not exists cortex_kb_doc_versions_doc_idx on cortex_kb_doc_versions(doc_id, version desc);

-- ─── Comments ────────────────────────────────────────────────────────────
comment on table cortex_crm_leads is 'M2 — CRM: leads com qualificação BANT';
comment on table cortex_crm_deals is 'M2 — CRM: oportunidades por stage';
comment on table cortex_tickets is 'M2 — Tickets/Suporte com SLA + CSAT';
comment on table cortex_billing_invoices is 'M2 — Faturamento BR: boleto/PIX + NF.e';
comment on table cortex_billing_dunning is 'M2 — Régua de cobrança automatizada';
comment on table cortex_kb_docs is 'M2 — Knowledge Base: docs versionados';
