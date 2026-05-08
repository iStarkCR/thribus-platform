-- ══════════════════════════════════════════════════════
-- Adiciona 3 perguntas ao bloco de coleta de dados (Estado 7)
-- 1. Forma de pagamento com o técnico (espécie / PIX / cartão)
-- 2. Como ficou sabendo da TexNet
-- 3. Qual era o antigo provedor
--
-- Esses 3 campos NÃO vão pro cadastro_wizard (IXC não tem
-- esses campos no schema). Ficam registrados na conversa
-- pra atendente humano / técnico consultar.
-- ══════════════════════════════════════════════════════

-- ─── 1. Lista de perguntas ────────────────────────────────────────────────────
update agents
set system_prompt = replace(
  system_prompt,
  $old$"Para finalizar seu cadastro, preciso de algumas informações:

👤 Nome completo:
📅 Data de nascimento:
📧 E-mail:
📱 Celular (com DDD):
💰 Melhor dia de vencimento (10 ou 15):"$old$,
  $new$"Para finalizar seu cadastro, preciso de algumas informações:

👤 Nome completo:
📅 Data de nascimento:
📧 E-mail:
📱 Celular (com DDD):
💰 Melhor dia de vencimento (10 ou 15):
💳 Forma de pagamento com o técnico (espécie, PIX ou cartão):
👀 Como ficou sabendo da TexNet?
🏢 Qual era seu antigo provedor?"$new$
)
where name ilike 'bianca%';

-- ─── 2. Bloco de confirmação ──────────────────────────────────────────────────
update agents
set system_prompt = replace(
  system_prompt,
  $old$💰 Vencimento: dia {10 ou 15}

Está tudo correto?"$old$,
  $new$💰 Vencimento: dia {10 ou 15}
💳 Pagamento técnico: {forma de pagamento informada}
👀 Origem: {como conheceu a Texnet}
🏢 Antigo provedor: {antigo provedor informado}

Está tudo correto?"$new$
)
where name ilike 'bianca%';

-- ─── 3. Instrução pro cadastro_wizard ─────────────────────────────────────────
-- Deixa explícito que os 3 campos novos NÃO vão pro wizard (não tem schema no IXC).
update agents
set system_prompt = replace(
  system_prompt,
  $old$Chame `cadastro_wizard` com todos os dados coletados (cpf, nome, email, celular, cep, rua, numero, bairro, complemento se houver, data_nascimento DD/MM/AAAA, tipo_cobranca:"B", dia_vencimento, canal_venda:"whatsapp").$old$,
  $new$Chame `cadastro_wizard` com todos os dados coletados (cpf, nome, email, celular, cep, rua, numero, bairro, complemento se houver, data_nascimento DD/MM/AAAA, tipo_cobranca:"B", dia_vencimento, canal_venda:"whatsapp").

⚠️ NÃO envie no `cadastro_wizard`:
- forma de pagamento com o técnico
- como conheceu a Texnet
- antigo provedor

Esses 3 campos são metadados de venda — ficam registrados apenas na conversa pra equipe humana consultar (técnico que vai instalar, time de marketing). O `cadastro_wizard` ignora qualquer campo extra.$new$
)
where name ilike 'bianca%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
-- Confere se as 3 mudanças foram aplicadas
select
  name,
  case when system_prompt like '%Forma de pagamento com o técnico%' then '✓' else '✗' end as q1_pagamento,
  case when system_prompt like '%Como ficou sabendo da TexNet%'      then '✓' else '✗' end as q2_origem,
  case when system_prompt like '%Qual era seu antigo provedor%'      then '✓' else '✗' end as q3_provedor,
  case when system_prompt like '%NÃO envie no `cadastro_wizard`%'    then '✓' else '✗' end as bloqueio_wizard
from agents
where name ilike 'bianca%';
