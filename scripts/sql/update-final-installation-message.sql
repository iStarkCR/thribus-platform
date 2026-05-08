-- ══════════════════════════════════════════════════════
-- Atualiza a mensagem final do Estado 11 (Confirmação Final)
-- pra incluir todos os dados do contrato + app + suporte.
--
-- Os 3 campos novos do Estado 7 (forma pagamento técnico,
-- origem, antigo provedor) NÃO entram aqui — ficam só no
-- chat conforme combinado. Mas a "forma de pagamento da
-- 1ª mensalidade" que aparece aqui é justamente o que
-- coletamos como "forma de pagamento com o técnico" (mesmo
-- dado, nome diferente pro cliente).
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = replace(
  system_prompt,
  $old$"📍 CONFIRMAÇÃO DA INSTALAÇÃO 📍

✅ Cliente: {nome real}
✅ Plano: {plano escolhido}
✅ Endereço: {rua, número - bairro}
✅ Data de Instalação: {dd/mm/yyyy}
✅ Período: Manhã (08h-12h) ou Tarde (13h-17h)

Nosso técnico entrará em contato antes da visita. Qualquer dúvida, estou à disposição! 😊

Bem-vindo à família Texnet! 🎉"$old$,
  $new$"📍 CONFIRMAÇÃO DA INSTALAÇÃO 📍

✅ Cliente: {nome real}
✅ Endereço da Instalação: {rua, número - bairro - cidade/CEP}
✅ Plano Contratado: {plano escolhido no Estado 6}
✅ Valor da Oferta: R$ {valor mensal do plano}
✅ Vencimento dos Boletos: dia {10 ou 15}
✅ Faturas: Boleto
✅ Forma de Pagamento da 1ª Mensalidade: {forma informada no Estado 7 — espécie, PIX ou cartão}
✅ Fidelidade: 12 meses

📌 Obs.: Em caso de cancelamento ou redução de velocidade antes dos 12 meses, será cobrada multa de 30% sobre as parcelas restantes.

✅ Data da Instalação: {dd/mm/yyyy real}
✅ Período da Instalação: {Manhã (08h-12h) ou Tarde (13h-17h)}

📱💻 Baixe o app Minha Tex:

Android: https://play.google.com/store/apps/details?id=br.com.texnet.texapp&pli=1
iOS: https://apps.apple.com/br/app/minha-tex/id1641339213

🔐 Login: CPF completo (somente números)
🔐 Senha: 6 primeiros dígitos do CPF

📞 Central de Atendimento: (85) 3036-7300 (WhatsApp e Ligações)
🌐 Site: www.texnet.com.br

Bem-vindo à família Texnet! 🎉"$new$
),
updated_at = now()
where name ilike 'bianca%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
select
  name,
  case when system_prompt like '%CONFIRMAÇÃO DA INSTALAÇÃO%'         then '✓' else '✗' end as cabecalho,
  case when system_prompt like '%Valor da Oferta: R$%'               then '✓' else '✗' end as valor,
  case when system_prompt like '%Vencimento dos Boletos%'            then '✓' else '✗' end as vencimento,
  case when system_prompt like '%Forma de Pagamento da 1ª Mensalidade%' then '✓' else '✗' end as forma_pagamento,
  case when system_prompt like '%Fidelidade: 12 meses%'              then '✓' else '✗' end as fidelidade,
  case when system_prompt like '%Baixe o app Minha Tex%'             then '✓' else '✗' end as app,
  case when system_prompt like '%(85) 3036-7300%'                    then '✓' else '✗' end as central,
  case when system_prompt like '%Bem-vindo à família Texnet%'        then '✓' else '✗' end as boas_vindas
from agents
where name ilike 'bianca%';
