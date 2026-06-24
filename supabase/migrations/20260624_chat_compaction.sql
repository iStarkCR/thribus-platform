-- Compactação de conversa (caminho C): mantém o histórico VISUAL intacto e
-- recomeça a sessão do claude semeada com um resumo curado (TL;DR) em vez do
-- corte cego de hoje (últimas N msgs cruas). Ataca o maior custo da operação:
-- re-processar contexto a cada turno. Ver a ponte (bukowiski-bridge.mjs) e
-- [[chat-blocos-ricos]].
--
-- O histórico (collaborator_messages) NÃO é tocado — só mexemos no ponteiro de
-- contexto do modelo (chat_sessions.claude_session_id) e guardamos a semente.

alter table public.chat_sessions
  add column if not exists context_seed text,             -- resumo que semeia a sessão nova
  add column if not exists compacted_at timestamptz,      -- quando compactou (p/ marcador/UI)
  add column if not exists compact_requested boolean not null default false; -- gatilho do botão "Compactar"

-- O marcador visual da compactação vive como mensagem role='system' (divisor +
-- o TL;DR), pra fluir no scroll naturalmente. A ponte (service role) insere; o
-- usuário só lê (policy de select já existente em collaborator_messages).
alter table public.collaborator_messages
  drop constraint if exists collaborator_messages_role_check;
alter table public.collaborator_messages
  add constraint collaborator_messages_role_check check (role in ('user', 'assistant', 'system'));
