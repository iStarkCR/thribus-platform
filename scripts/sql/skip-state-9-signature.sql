-- Atualiza o prompt da Bianca pra pular Estado 9 (verificação de assinatura).
-- O CRM Texnet ainda não tem o fluxo de status_contrato finalizado.
-- Fluxo novo: Estado 8 (cadastro_wizard) → Estado 10 (consultar_agenda) direto.
--
-- A mensagem de "baixe o app + assine" continua, mas a Bianca não espera
-- o cliente confirmar. Pergunta a data de instalação na sequência.

update agents set
  system_prompt = replace(
    system_prompt,
    'Após assinar, me avise aqui! 😊',
    'Pode baixar e assinar quando puder! Enquanto isso, vamos agendar a instalação. Qual data seria melhor para você?'
  ),
  updated_at = now()
where name = 'Bianca';

-- Confirma
select
  case when system_prompt ilike '%vamos agendar a instalação%' then 'fix aplicado ✅'
       else 'fix NÃO aplicado ❌' end as status
from agents where name = 'Bianca';
