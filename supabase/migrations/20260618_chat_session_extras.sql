-- ============================================================================
-- Extras da conversa — cor e fixar no topo (pin)
-- ============================================================================
-- color     = etiqueta de cor da conversa (igual pastas já têm).
-- pinned_at = quando foi fixada (null = não fixada). Fixadas vão pro topo.
-- ============================================================================

alter table public.chat_sessions
  add column if not exists color text;

alter table public.chat_sessions
  add column if not exists pinned_at timestamptz;

create index if not exists idx_chat_sessions_pinned
  on public.chat_sessions(user_id, agent_id, pinned_at);
