-- ───────────────────────────────────────────────────────────────────────────
-- Time Interno v3 — organograma completo Thribus em internal_agents
--
-- Representa o organograma (16 colaboradores) com a fronteira interno/cliente:
--   scope='internal' → roda via Claude Code, orquestrado pelo Bukowiski
--   scope='client'   → cliente-facing; subagent interno por ora, migra pro
--                      worker/API quando exposto a cliente real
--   scope='gestao'   → o próprio Bukowiski (COO)
-- ───────────────────────────────────────────────────────────────────────────

alter table public.internal_agents
  add column if not exists scope        text not null default 'internal'
    check (scope in ('internal','client','gestao')),
  add column if not exists org_group    text,   -- tecnologia | receita | cliente | governanca | gestao
  add column if not exists sector       text,   -- ex: "Infra / SRE", "Financeiro"
  add column if not exists description  text,
  add column if not exists skills       text[], -- skills Thribus que o colaborador usa (informativo)
  add column if not exists escalates_to text;   -- pra quem escala
