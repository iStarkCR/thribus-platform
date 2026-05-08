-- ══════════════════════════════════════════════════════
-- Bianca: passar plano_id e valor_mensal ao chamar cadastro_wizard
-- ══════════════════════════════════════════════════════
-- Bug detectado: o n8n hardcoda plano_id=1393 e não envia valor_unitario,
-- então TODOS os contratos no IXC ficam com plano errado e valor NULL.
--
-- Fix em 3 partes:
--  1. n8n: aceitar plano_id, valor_mensal, cidade_id (com fallback) ✓ aplicado em produção
--  2. worker tool-schemas.ts: aceitar os campos opcionais ✓ aplicado em código
--  3. ESTE SQL: prompt orienta Bianca a SEMPRE passar plano_id + valor_mensal
--     a partir do retorno do listar_planos
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = replace(
  system_prompt,
  $old$Chame `cadastro_wizard` com todos os dados coletados (cpf, nome, email, celular, cep, rua, numero, bairro, complemento se houver, data_nascimento DD/MM/AAAA, tipo_cobranca:"B", dia_vencimento, canal_venda:"whatsapp").$old$,
  $new$Chame `cadastro_wizard` com todos os dados coletados (cpf, nome, email, celular, cep, rua, numero, bairro, complemento se houver, data_nascimento DD/MM/AAAA, tipo_cobranca:"B", dia_vencimento, canal_venda:"whatsapp", **plano_id**, **valor_mensal**).

⚠️ OBRIGATÓRIO passar `plano_id` e `valor_mensal` do plano que o cliente escolheu (vêm no retorno do `listar_planos`):
- `plano_id` = id numérico do plano (campo `id` do listar_planos). Ex: "1393", "1402", etc.
- `valor_mensal` = valor mensal em reais (campo `valor` ou `valor_contrato`). Ex: "99.90", "149.90".

Sem esses dois campos, o IXC cadastra com plano errado e valor zerado — nunca pule.$new$
)
where name ilike 'bianca%';

-- E também atualiza o bloco de "NÃO envie no cadastro_wizard" (que adicionamos antes
-- pros 3 campos extras de venda) pra deixar claro o que VAI agora:
update agents
set system_prompt = replace(
  system_prompt,
  $old$⚠️ NÃO envie no `cadastro_wizard`:
- forma de pagamento com o técnico
- como conheceu a Texnet
- antigo provedor

Esses 3 campos são metadados de venda — ficam registrados apenas na conversa pra equipe humana consultar (técnico que vai instalar, time de marketing). O `cadastro_wizard` ignora qualquer campo extra.$old$,
  $new$⚠️ NÃO envie no `cadastro_wizard`:
- forma de pagamento com o técnico
- como conheceu a Texnet
- antigo provedor

Esses 3 campos são metadados de venda — ficam registrados apenas na conversa pra equipe humana consultar (técnico que vai instalar, time de marketing). O `cadastro_wizard` ignora qualquer campo extra.

✅ SIM envie sempre no `cadastro_wizard`:
- `plano_id` (do listar_planos)
- `valor_mensal` (do listar_planos)$new$
)
where name ilike 'bianca%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
select
  name,
  case when system_prompt like '%plano_id%' and system_prompt like '%valor_mensal%' then '✓' else '✗' end as menciona_plano_valor,
  case when system_prompt like '%OBRIGATÓRIO passar `plano_id`%'      then '✓' else '✗' end as instrucao_obrigatoria,
  case when system_prompt like '%nunca pule%'                          then '✓' else '✗' end as enfase_nao_pular
from agents
where name ilike 'bianca%';
