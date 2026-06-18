-- ============================================================================
-- Cortex Skills — cadastrar skills pelo painel que alimentam o Claude de verdade
-- ============================================================================
-- A ponte:
--   • IMPORTA as skills reais de ~/.claude/skills (managed=false) → só espelho
--     no painel, nunca reescreve essas.
--   • MATERIALIZA as criadas no painel (managed=true) e ligadas (enabled) em
--     ~/.claude/skills/<slug>/SKILL.md — e só remove o que ELA criou (manifesto).
-- slug é único: uma skill do painel nunca pode colidir com uma real.
-- ============================================================================

create table if not exists public.cortex_skills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                                   -- null = importada (mirror)
  slug        text not null unique,
  name        text not null,
  description text,
  body        text not null default '',
  managed     boolean not null default true,          -- true = criada no painel (a ponte escreve)
  enabled     boolean not null default false,         -- "alimentar o Claude" (só vale pra managed)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.cortex_skills enable row level security;

drop policy if exists "cortex_skills_admin" on public.cortex_skills;
create policy "cortex_skills_admin" on public.cortex_skills
  for all
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin() or user_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_cortex_skills_touch on public.cortex_skills;
create trigger trg_cortex_skills_touch before update on public.cortex_skills
  for each row execute function public.touch_updated_at();

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
