-- ============================================================================
-- Arquivar conversas — esconde da lista sem apagar
-- ============================================================================
-- archived_at = quando foi arquivada (null = ativa). A lista principal filtra
-- as ativas; as arquivadas ficam recuperáveis numa seção à parte.
-- ============================================================================

alter table public.chat_sessions
  add column if not exists archived_at timestamptz;

create index if not exists idx_chat_sessions_archived
  on public.chat_sessions(user_id, agent_id, archived_at);
