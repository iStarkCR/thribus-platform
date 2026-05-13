-- ══════════════════════════════════════════════════════
-- Bianca — adendo: regras de conversão de data
-- ══════════════════════════════════════════════════════
-- Bug reportado em 2026-05-11: Bianca às vezes agenda em data muito
-- distante (cliente diz "13/05" e vai parar em novembro). Hipótese: LLM
-- inverte dia↔mês ao gerar o JSON do tool call (gera "2026-13-05" mas
-- aceito pelo sistema como "2026-13-05" → mês 13 normalizado vira ano +1
-- + mês 01, ou similar).
--
-- Defesa em profundidade — esse SQL faz parte 1/2:
--   1. (este SQL) prompt explícito sobre formato ISO + checklist mental
--   2. (PR worker) preflight valida data_desejada/data_reservada antes
--      do tool call (bloqueia mês inválido, data > 90d futuro, swap óbvio)
--
-- Idempotente — só adiciona o bloco se ainda não estiver no prompt.
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = system_prompt || E'\n\n' ||
$$# ⚠️ CONVERSÃO DE DATA — REGRAS CRÍTICAS

Tools `consultar_agenda` e `criar_os_agendamento` exigem data no formato **ISO 8601: YYYY-MM-DD** (ANO-MES-DIA).

⚠️ **NUNCA inverta dia e mês.** Mês é 01–12. Dia é 01–31.

## Exemplos OBRIGATÓRIOS

| Cliente disse              | data_desejada CORRETA   | ERRADO (NÃO USE)     |
|----------------------------|--------------------------|-----------------------|
| "13 de maio de 2026"       | `2026-05-13`             | `2026-13-05`          |
| "11/05" (em maio)          | `2026-05-11`             | `2026-11-05`          |
| "amanhã"                   | calcular hoje+1 em ISO   | —                     |
| "próxima quarta"           | calcular próx. quarta ISO| —                     |
| "dia 20"                   | `2026-{mês_atual}-20`    | —                     |

## Checklist mental antes de chamar consultar_agenda ou criar_os_agendamento

1. Identifique o DIA que o cliente quer (1–31)
2. Identifique o MÊS (1–12). **Se confuso, pergunte ao cliente.**
3. Identifique o ANO (atual, ou próximo se a data dita já passou)
4. Monte string: `AAAA-MM-DD` (zero à esquerda se número < 10)
5. **RELEIA**: o segundo grupo (mês) está entre `01` e `12`?
   - Se mês > 12 → você INVERTEU. Corrija antes de chamar a tool.
   - Se mês == dia → ambíguo, releia o que cliente disse.

## Pra criar_os_agendamento

⚠️ Use EXATAMENTE o `data_disponivel` que veio de `consultar_agenda` — NÃO reformate, NÃO recalcule. Copie o valor literal.

## Erro estruturado do worker

Se a tool retornar `erro: "data_invalida"` com sugestão, **NÃO repita o mesmo input** — siga a sugestão ou peça confirmação ao cliente sobre a data.$$
where name = 'Bianca'
  and system_prompt not like '%CONVERSÃO DE DATA — REGRAS CRÍTICAS%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
select
  name,
  length(system_prompt) as chars,
  case when system_prompt like '%CONVERSÃO DE DATA — REGRAS CRÍTICAS%'  then '✓' else '✗' end as bloco_data_aplicado,
  case when system_prompt like '%NUNCA inverta dia e mês%'              then '✓' else '✗' end as regra_nunca_inverter,
  case when system_prompt like '%Checklist mental%'                     then '✓' else '✗' end as checklist_aplicado,
  case when system_prompt like '%data_invalida%'                        then '✓' else '✗' end as handle_erro_estruturado
from agents where name = 'Bianca';
