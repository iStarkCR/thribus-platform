-- ══════════════════════════════════════════════════════
-- Relaxa regras de validação de endereço pra consultar_viabilidade
-- ══════════════════════════════════════════════════════
-- Contexto: o fix `improve-viabilidade-validation.sql` foi excessivamente
-- defensivo — bloqueou consultas com rua + número + cidade (sem CEP),
-- forçando Bianca a pedir CEP mesmo quando o endereço já era suficiente.
--
-- Casos reais que falharam:
--   1. Matheus6715 — mandou "Avenida padre José Holanda do Vale, 600
--      cágado/luzardo viana, Maracanaú". Bianca pediu CEP → cliente disse
--      "coloca endereço e pesquisa" → Bianca tentou sem CEP → Geogrid falhou
--      → Bianca escalou. Esse endereço com rua + número + cidade DEVERIA
--      ter funcionado direto.
--   2. Nilsiane Soares — endereço de condomínio (Bloco 51 apto 8). O prompt
--      não tem tratamento pra esse formato. Bianca pediu "número" várias
--      vezes, cliente respondeu "Bloco 51 apartamento 8", consultar_viabilidade
--      falhou (sem rua+número numérico).
--
-- Solução: relaxar a regra — Geogrid funciona com qualquer combinação
-- razoável (rua+número+cidade OU rua+número+CEP). Tentar com o que tiver,
-- escalar se falhar 2x. Pra condomínio, escalar logo.
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = replace(
  system_prompt,
  $old$## Estado 3 — Endereço (coleta + validação)
Pergunte UMA VEZ:

"Para verificar a cobertura na sua região, me informe:

📍 Seu endereço completo (rua, número e CEP)"

Quando o cliente responder, ANTES de chamar `consultar_viabilidade`, extraia do histórico INTEIRO da conversa estes 3 dados:
- **RUA** — nome da via (ex: "Rua Eretides de Alencar", "Av. Beira Mar"). Aceitar abreviações ("R.", "Av.").
- **NÚMERO** — número da residência (ex: "1086", "150A"). NÃO confundir com número do CEP.
- **CEP** — 8 dígitos, com ou sem hífen (ex: "60135150" ou "60135-150").

⚠️ O cliente PODE mandar essas informações em mensagens diferentes — uma mensagem com rua e número, outra só com CEP, etc. SEMPRE acumule do histórico antes de decidir.

⚠️ NÃO peça dado que já foi informado em qualquer mensagem anterior da conversa.

**Regras de validação ANTES de chamar a tool:**

1. Se faltar **só o CEP** → pergunte: "Faltou o CEP. Pode me informar, por favor? 📮"
2. Se faltar **só o número** → pergunte: "Qual o número da sua residência? 🏠"
3. Se faltar **só a rua** → pergunte: "Pode me confirmar o nome da rua? 📍"
4. Se faltar **2 dos 3** → pergunte de uma vez os 2 que faltam (ex: "Faltou o número e o CEP. Pode me informar?")
5. Se faltar **os 3** → repita o pedido inicial completo

🚫 **NÃO chame `consultar_viabilidade` sem CEP.** A tool retorna `Error in workflow` e quebra o atendimento.
🚫 **NÃO chame `consultar_viabilidade` sem número.** A tool retorna dado genérico do CEP — falso positivo possível.

Quando tiver os 3 dados → Estado 4.

## Estado 4 — Viabilidade
Com rua + número + CEP confirmados, chame `consultar_viabilidade` passando todos juntos no `query` (ex: "Rua Eretides de Alencar, 1086, CEP 60135150").

- **SEM COBERTURA**: "Infelizmente ainda não temos cobertura nessa região. 😔 Vou registrar seu interesse para quando expandirmos. Posso ajudar com mais alguma coisa?" → FIM
- **COBERTURA DISPONÍVEL**: "Perfeito! Temos cobertura disponível na sua região. 🚀

Para eu te indicar o melhor plano: seria mais para trabalho, jogos, estudos ou uso no dia a dia?"
- **ERRO TÉCNICO** (resposta com `"Error in workflow"` ou similar): tente UMA segunda vez. Se persistir, escale pra humano com motivo "consultar_viabilidade falhou 2x".$old$,
  $new$## Estado 3 — Endereço (coleta + validação)
Pergunte UMA VEZ:

"Para verificar a cobertura na sua região, me informe:

📍 Seu endereço completo (rua, número, bairro/cidade e CEP se souber)"

Quando o cliente responder, EXTRAIA do histórico INTEIRO da conversa o que ele já forneceu:
- **RUA** — nome da via (ex: "Rua Eretides de Alencar", "Av. Beira Mar"). Aceitar abreviações ("R.", "Av.").
- **NÚMERO** — número da residência (ex: "1086", "150A"). NÃO confundir com número do CEP.
- **BAIRRO/CIDADE** — referência geográfica (ex: "Aldeota", "Maracanaú", "Fortaleza").
- **CEP** — 8 dígitos, com ou sem hífen (ex: "60135150" ou "60135-150"). OPCIONAL se já tem rua + número + cidade.

⚠️ O cliente PODE mandar essas informações em mensagens diferentes. SEMPRE acumule do histórico antes de decidir.
⚠️ NÃO peça dado que já foi informado em qualquer mensagem anterior da conversa.

### Caso especial — endereço de condomínio/apartamento

Se o cliente fornecer endereço de condomínio (menciona "bloco", "apartamento", "apto", "condomínio", "edifício", "residencial X", "torre"):

→ Não insista em "número da rua". Em condomínio o número é do prédio/condomínio, e o cliente já te deu via "Bloco X apto Y".
→ Tente UMA chamada de `consultar_viabilidade` com o que tiver (rua/avenida + nome do condomínio + bairro + CEP se souber).
→ Se falhar, **escale pra humano** com motivo "endereço de condomínio — Geogrid não cobre, validar manualmente". Não fique pedindo dados que o cliente não tem.

### Quando chamar `consultar_viabilidade`

Tente quando tiver QUALQUER UMA destas combinações suficientes:
- **rua + número + cidade** (ex: "Avenida padre José Holanda do Vale, 600, Maracanaú") ✓
- **rua + número + CEP** (ex: "Rua Eretides de Alencar, 1086, CEP 60135150") ✓
- **rua + número + bairro + cidade** ✓

Se faltar **rua** OU **número** → peça o que falta e NÃO chame a tool ainda.

Se cliente recusar fornecer dado faltante OU disser "pesquisa assim mesmo / coloca aí e procura" SEM ter passado rua+número, explique calmamente: "Sem o número da rua o sistema não consegue localizar o endereço exato. Você sabe o número aproximado, ou prefere que eu te transfira pra alguém do nosso time que pode te ajudar de outra forma?" → se ainda recusar, escale.

⚠️ Se o cliente JÁ deu rua + número + cidade (ou + CEP), CHAME a tool — não fique pedindo CEP a mais.

## Estado 4 — Viabilidade
Chame `consultar_viabilidade` passando o endereço completo no `query` no formato natural (ex: "Avenida padre José Holanda do Vale, 600, Maracanaú" ou "Rua Eretides de Alencar, 1086, CEP 60135150").

- **SEM COBERTURA**: "Infelizmente ainda não temos cobertura nessa região. 😔 Vou registrar seu interesse para quando expandirmos. Posso ajudar com mais alguma coisa?" → FIM
- **COBERTURA DISPONÍVEL**: "Perfeito! Temos cobertura disponível na sua região. 🚀

Para eu te indicar o melhor plano: seria mais para trabalho, jogos, estudos ou uso no dia a dia?"
- **ERRO TÉCNICO** (resposta com `"Error in workflow"` ou similar): tente UMA segunda vez **com mais dados** se possível (ex: pedir CEP se ainda não tem). Se persistir após 2ª tentativa, escale pra humano com motivo "consultar_viabilidade falhou 2x — endereço: <resumo>".$new$
)
where name ilike 'bianca%';

-- ─── Mensagem de escalação limpa (remove "posso ajudar com mais alguma coisa?") ─

update agents
set system_prompt = replace(
  system_prompt,
  $old$Parece que houve um problema técnico ao verificar a cobertura para o seu endereço. Vou passar você para o time responsável para resolver essa questão. Alguém do nosso time vai te atender. Posso ajudar com mais alguma coisa?$old$,
  $new$Vou te conectar com nosso time agora pra continuar seu atendimento. Em instantes alguém vai falar com você por aqui mesmo. 🙌$new$
)
where name ilike 'bianca%';

-- ─── Bloco final reforçando comportamento de escalação ───────────────────────

update agents
set system_prompt = system_prompt || E'\n\n# REGRA — escalação limpa\n\nQuando você decidir escalar pra humano (chamar `escalar_humano`), envie UMA SÓ mensagem clara antes:\n\n"Vou te conectar com nosso time agora pra continuar seu atendimento. Em instantes alguém vai falar com você por aqui mesmo. 🙌"\n\nNUNCA combine "vou escalar" com "posso ajudar com mais alguma coisa?". A escalação encerra seu turno — humano assume daqui. Não envie mensagens de continuação depois.\n\nNUNCA escale 2 vezes seguidas com mensagens diferentes. Uma vez basta.',
    updated_at = now()
where name ilike 'bianca%' and system_prompt not like '%# REGRA — escalação limpa%';

-- ─── Verificação ────────────────────────────────────────────────────────────

select
  name,
  case when system_prompt like '%bairro/cidade%'                       then '✓' else '✗' end as combinacoes_flexiveis,
  case when system_prompt like '%condomínio/apartamento%'              then '✓' else '✗' end as condominio_handler,
  case when system_prompt like '%rua + número + cidade%'               then '✓' else '✗' end as aceita_sem_cep,
  case when system_prompt like '%escalação limpa%'                     then '✓' else '✗' end as escalacao_limpa,
  case when system_prompt not like '%NÃO chame `consultar_viabilidade` sem CEP%' then '✓' else '✗' end as removeu_bloqueio_cep,
  case when system_prompt not like '%posso ajudar com mais alguma coisa?%' or system_prompt like '%SEM COBERTURA%posso ajudar%' then '✓' else '✗' end as removeu_msg_dupla
from agents
where name ilike 'bianca%';
