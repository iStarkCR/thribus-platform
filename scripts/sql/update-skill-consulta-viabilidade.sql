-- ══════════════════════════════════════════════════════
-- Atualiza skill `consulta-viabilidade-isp` pra v1.1.0
-- ══════════════════════════════════════════════════════
-- O seed original (migration 008) foi escrito ANTES do fix do PR #32
-- (relax-viabilidade-rules.sql). Continha "NUNCA chame consultar_viabilidade
-- sem CEP" — exatamente a regra que descobrimos ser excessivamente
-- defensiva (caso Matheus, "Av X, 600, Maracanaú" já era suficiente).
--
-- Esta versão:
--   - Aceita rua + número + (cidade OU CEP)
--   - Trata endereço de condomínio (bloco/apto/edifício)
--   - 2 tentativas antes de escalar
--   - Mensagem de escalação limpa (não duplicada)
--
-- Idempotente. Aplica em qualquer banco onde a skill exista.
-- ══════════════════════════════════════════════════════

update skills
set
  prompt_fragment = $$## Skill: Consulta de Viabilidade (ISP)

Esta skill reforça o tratamento de endereços e a chamada do `consultar_viabilidade`. O backend (Geogrid) tem peculiaridades — siga as regras abaixo pra evitar falhas e loops.

### Quando chamar `consultar_viabilidade`

Tente quando tiver QUALQUER UMA destas combinações suficientes:
- **rua + número + cidade** (ex: "Avenida Padre José Holanda do Vale, 600, Maracanaú") ✓
- **rua + número + CEP** (ex: "Rua Eretides de Alencar, 1086, CEP 60135150") ✓
- **rua + número + bairro + cidade** ✓

Se faltar **rua** OU **número** → peça o que falta e NÃO chame a tool ainda.

### Caso especial — endereço de condomínio

Se o cliente mencionar "bloco", "apartamento", "apto", "condomínio", "edifício", "residencial X" ou "torre":

→ NÃO insista em "número da rua". Em condomínio o número é do prédio/condomínio — o cliente já te deu via "Bloco X apto Y".
→ Tente UMA chamada de `consultar_viabilidade` com o que tiver (rua/avenida + nome do condomínio + bairro + CEP se souber).
→ Se falhar, **escale pra humano** com motivo "endereço de condomínio — Geogrid não cobre, validar manualmente". Não fique pedindo dados que o cliente não tem.

### Recusa do cliente em fornecer dado faltante

Se o cliente disser "pesquisa assim mesmo / coloca aí e procura" SEM ter passado rua+número, explique calmamente:

"Sem o número da rua o sistema não consegue localizar o endereço exato. Você sabe o número aproximado, ou prefere que eu te transfira pra alguém do nosso time que pode te ajudar de outra forma?"

Se ainda recusar, **escale**. NÃO chame a tool com dados insuficientes.

### Tratamento de erro técnico

Quando `consultar_viabilidade` retornar erro (ex: "Error in workflow"):
1. Tente UMA segunda vez **com mais dados** se possível (ex: pedir CEP se ainda não tem).
2. Se persistir após 2ª tentativa, escale pra humano com motivo "consultar_viabilidade falhou 2x — endereço: <resumo>".

NÃO escale na 1ª falha. NÃO tente uma 3ª.

### Resultado da consulta

- **SEM COBERTURA**: "Infelizmente ainda não temos cobertura nessa região. 😔 Vou registrar seu interesse para quando expandirmos. Posso ajudar com mais alguma coisa?" → FIM
- **COBERTURA DISPONÍVEL**: "Perfeito! Temos cobertura disponível na sua região. 🚀" → segue pro próximo estado (apresentação de planos)
- **COBERTURA PARCIAL** (resultado ambíguo): peça confirmação do endereço e tente uma 2ª vez.$$,
  required_tools = array['consultar_viabilidade', 'escalar_humano'],
  version = '1.1.0',
  description = 'Tratamento robusto de endereço pra consultar_viabilidade. Aceita combinações flexíveis (rua+número+cidade, rua+número+CEP, condomínio com bloco/apto). 2 tentativas antes de escalar. Alinhado com o fix do prompt da Bianca (PR #32).',
  updated_at = now()
where slug = 'consulta-viabilidade-isp';

-- ─── Verificação ────────────────────────────────────────────────────────────

select
  slug,
  version,
  array_length(required_tools, 1) as tools_count,
  length(prompt_fragment) as prompt_chars,
  case
    when prompt_fragment like '%rua + número + cidade%' then '✓'
    else '✗'
  end as aceita_sem_cep,
  case
    when prompt_fragment like '%condomínio%' then '✓'
    else '✗'
  end as trata_condominio,
  case
    when prompt_fragment not like '%NUNCA chame%consultar_viabilidade%sem CEP%' then '✓'
    else '✗'
  end as removeu_bloqueio_cep,
  case
    when prompt_fragment like '%2ª tentativa%' or prompt_fragment like '%2 vezes%' or prompt_fragment like '%2ª%' then '✓'
    else '✗'
  end as tem_retry_2x
from skills
where slug = 'consulta-viabilidade-isp';
