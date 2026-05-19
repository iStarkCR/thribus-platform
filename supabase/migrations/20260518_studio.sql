-- ============================================================================
-- Migration: Studio Canvas — no-code builder com persistência
-- ============================================================================

create table if not exists public.studio_canvases (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  name            text not null,
  description     text,
  blocks          jsonb not null default '[]'::jsonb,
                  -- [{ id, type, title, subtitle, configSummary, position:{x,y}, connectsTo:[ids] }]
  status          text not null default 'draft' check (status in ('draft','published','archived')),
  published_at    timestamptz,
  published_version integer not null default 0,
  author          uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_canvases_workspace
  on public.studio_canvases(workspace_id, updated_at desc);

-- Snapshots por publish (versionamento)
create table if not exists public.studio_canvas_versions (
  id              uuid primary key default gen_random_uuid(),
  canvas_id       uuid not null references public.studio_canvases(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  version         integer not null,
  blocks          jsonb not null,
  published_by    uuid references auth.users(id),
  published_at    timestamptz not null default now(),
  unique (canvas_id, version)
);

drop trigger if exists trg_canvas_touch on public.studio_canvases;
create trigger trg_canvas_touch
  before update on public.studio_canvases
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.studio_canvases enable row level security;
alter table public.studio_canvas_versions enable row level security;

create policy "canvases_select" on public.studio_canvases for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "canvases_write" on public.studio_canvases for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "canvas_versions_select" on public.studio_canvas_versions for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- ─── Trigger: ao publish, snapshota versão ──────────────────────────────────
create or replace function public.snapshot_canvas_on_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (old.status != 'published' or old.blocks::text != new.blocks::text) then
    new.published_version := coalesce(old.published_version, 0) + 1;
    new.published_at := now();
    insert into public.studio_canvas_versions (
      canvas_id, workspace_id, version, blocks, published_by, published_at
    ) values (
      new.id, new.workspace_id, new.published_version, new.blocks, new.author, new.published_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_canvas_publish on public.studio_canvases;
create trigger trg_canvas_publish
  before update on public.studio_canvases
  for each row execute function public.snapshot_canvas_on_publish();

comment on table public.studio_canvases is
  'Canvas no-code do Studio. blocks JSONB persiste posicionamento + conexões + config.';
comment on table public.studio_canvas_versions is
  'Snapshot por publish — rollback fácil + audit trail de mudanças.';
