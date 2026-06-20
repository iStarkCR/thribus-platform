-- Botão "Parar" do chat: o front marca a msg do usuário como 'cancelled' e a
-- ponte mata o claude e descarta a resposta. Adiciona o status ao CHECK.
alter table collaborator_messages drop constraint if exists collaborator_messages_status_check;
alter table collaborator_messages
  add constraint collaborator_messages_status_check
  check (status in ('pending','processing','done','error','cancelled'));
