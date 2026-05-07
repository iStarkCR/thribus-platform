-- Adiciona regra explícita pra Bianca tentar 2x antes de escalar quando uma
-- tool retornar erro técnico. Hoje ela está escalando logo na 1ª falha.

update agents set
  system_prompt = system_prompt || E'\n\n# REGRA DE RETRY EM ERROS TÉCNICOS\n\nQuando uma tool retornar erro (ex: consultar_viabilidade, criar_os_agendamento, cadastro_wizard, status_contrato), TENTE A TOOL NOVAMENTE pelo menos UMA VEZ antes de mencionar problema técnico ao cliente ou escalar pra time.\n\nFluxo correto em caso de erro técnico:\n1. Tool retorna erro pela 1ª vez → tente CHAMAR A TOOL DE NOVO no mesmo turno (sem dizer nada ao cliente).\n2. Se falhar pela 2ª vez → aí sim informe o cliente do problema técnico e/ou escale.\n\nNUNCA escale automaticamente na primeira falha técnica. Sempre dê uma segunda chance.\n\nExemplo:\n- consultar_viabilidade retorna erro → chame consultar_viabilidade DE NOVO com o mesmo endereço.\n- criar_os_agendamento retorna erro → chame criar_os_agendamento DE NOVO com os mesmos dados.\n- Só após 2 falhas consecutivas, informe ao cliente e ofereça opções (escalar ou tentar outra data).',
  updated_at = now()
where name = 'Bianca';

-- Confirma
select
  case when system_prompt ilike '%REGRA DE RETRY EM ERROS%' then 'fix aplicado ✅'
       else 'fix NÃO aplicado ❌' end as status
from agents where name = 'Bianca';
