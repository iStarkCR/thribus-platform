-- Cortex Brain: override de modelo/esforço POR SESSÃO de chat.
-- Antes, a escolha de modelo vivia só em cortex_brain_config (scope='global') —
-- uma linha pra todo o time, o que fazia trocar o modelo num chat mudar em todos.
-- Agora cada conversa guarda sua própria escolha aqui. null = sem override → AUTO.
alter table public.chat_sessions
  add column if not exists model_override text,
  add column if not exists effort_override text;
