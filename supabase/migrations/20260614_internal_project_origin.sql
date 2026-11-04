-- Ponte chat (WhatsApp/Telegram via Talki) ⇄ orchestrator do Time Interno.
-- Guarda de qual conversa do chat o projeto foi aberto, pra o orchestrator
-- reportar os marcos (plano pronto, gate crítico, conclusão) de volta no mesmo
-- canal — não só no painel /team.
alter table internal_projects
  add column if not exists origin_conversation_id text;
