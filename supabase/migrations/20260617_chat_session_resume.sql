-- ============================================================================
-- Memória otimizada do chat: sessão do claude (--resume) + janela de contexto
-- ============================================================================
-- A ponte guarda o session_id que o claude devolve por conversa. Nas próximas
-- mensagens usa --resume e manda SÓ a mensagem nova (a persona/histórico já
-- estão na sessão do claude) → derruba o custo. context_tokens = tamanho atual
-- da janela de contexto (pro painel mostrar "X / 1M" como o Claude).
-- ============================================================================

alter table public.chat_sessions add column if not exists claude_session_id text;
alter table public.chat_sessions add column if not exists context_tokens int not null default 0;
