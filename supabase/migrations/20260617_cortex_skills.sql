-- ============================================================================
-- Cortex Skills — cadastro de skills do time direto pelo painel (Cortex Brain)
-- ============================================================================
-- Espelho do Claude: o Charles escreve a skill aqui (nome + descrição + markdown)
-- e a ponte (bridge, service role) materializa cada skill habilitada em
--   ~/.claude/skills/<slug>/SKILL.md
-- pro Bukowiski e colaboradores passarem a usar sem mexer em arquivo.
--
-- Fluxo:
--   • painel  → CRUD em cortex_skills (super-admin).
--   • ponte   → lê enabled=true e escreve/atualiza ~/.claude/skills/<slug>/SKILL.md;
--               remove a pasta quando a skill é desabilitada/excluída; grava
--               installed_at de volta (o painel mostra "instalada" em tempo real).
--
-- SKILL.md materializado:
--   ---
--   name: <slug>
--   description: <description>
--   ---
--   <content>
-- ============================================================================

create table if not exists public.cortex_skills (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9][a-z0-9-]*$'),  -- nome da pasta ~/.claude/skills/<slug>/
  name         text not null,                          -- nome de exibição no painel
  description  text not null default '',               -- frontmatter `description` (o gatilho da skill)
  content      text not null default '',               -- corpo markdown do SKILL.md (depois do frontmatter)
  enabled      boolean not null default true,
  installed_at timestamptz,                            -- quando a ponte materializou no disco (null = ainda não)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_cortex_skills_enabled
  on public.cortex_skills(enabled);

alter table public.cortex_skills enable row level security;

-- Skills globais do sistema: só super-admin lê/escreve (a ponte usa service role).
drop policy if exists "cortex_skills_admin" on public.cortex_skills;
create policy "cortex_skills_admin" on public.cortex_skills
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- touch_updated_at() já existe (20260617_cortex_brain.sql); recria por idempotência.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_cortex_skills_touch on public.cortex_skills;
create trigger trg_cortex_skills_touch before update on public.cortex_skills
  for each row execute function public.touch_updated_at();

-- Realtime: o painel vê "instalada" piscar quando a ponte materializa no disco.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cortex_skills'
  ) then
    alter publication supabase_realtime add table public.cortex_skills;
  end if;
end $$;
