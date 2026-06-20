-- Marca mensagens vindas do MODO VOZ do orbe. A ponte (bukowiski-bridge) usa
-- pra rodar voz com modelo leve/rápido (sonnet+low), enquanto a execução normal
-- (texto/painel/demandas) segue no modelo forte do cortex_brain_config global.
alter table collaborator_messages
  add column if not exists is_voice boolean not null default false;
