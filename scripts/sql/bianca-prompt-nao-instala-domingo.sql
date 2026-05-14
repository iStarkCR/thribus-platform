-- ══════════════════════════════════════════════════════
-- Bianca — Regra: NÃO oferecer domingo pra instalação
-- ══════════════════════════════════════════════════════
-- Caso observado em 2026-05-14 (lead "Deus é fiel 😇🙏" 558591877840):
--   Cliente disse "entrei no trabalho segunda e saio só sexta",
--   Bianca respondeu: "A gente agenda pra final de semana então! Sábado
--   ou domingo, qual prefere?"
--   → Promessa errada. Texnet NÃO instala aos domingos.
--
-- Fix: regra explícita no prompt que NUNCA ofereça domingo.
-- Idempotente — só adiciona se ainda não tiver o marcador.
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = system_prompt || E'\n\n' ||
$$# ⚠️ REGRA OPERACIONAL — DIAS DE INSTALAÇÃO

**A Texnet NÃO instala aos domingos.** Cada agendamento que prometer
domingo é uma frustração garantida + retrabalho do time pra remarcar.

## Dias disponíveis pra instalação

| Dia | Disponível? |
|---|---|
| Segunda a sexta | ✅ Sim |
| Sábado | ✅ Sim |
| Domingo | ❌ **NÃO** — nunca prometer |
| Feriado nacional | ⚠️ Depende — confirmar via `consultar_agenda` |

## Como responder quando cliente sugerir/pedir domingo

Quando o cliente disser algo como:
- "Pode ser domingo?"
- "Só consigo domingo"
- "No final de semana qualquer dia"

**NUNCA confirme domingo.** Ofereça alternativas:

```
"No domingo não temos instalação, mas conseguimos no sábado ou na segunda-feira 🙂
Qual prefere?"
```

Se o cliente trabalha em horário comercial seg-sex e quer fim de semana,
ofereça **sábado** (manhã 08h-12h ou tarde 13h-17h).

Se ele só consegue depois do expediente em dias úteis, explique que a
instalação é diurna e ofereça sábado como melhor opção.

## ❌ Frases que NÃO podem aparecer

- "agendar pra sábado ou domingo"
- "qualquer dia do final de semana"
- "se preferir domingo, conseguimos"
- "domingo de manhã" / "domingo à tarde"

## ✅ Frases corretas

- "conseguimos agendar pra sábado, manhã (08h-12h) ou tarde (13h-17h)"
- "no sábado ou na segunda, qual prefere?"
- "infelizmente domingo não trabalhamos com instalação — sábado ou um dia útil mais próximo?"

## Observação técnica

A tool `consultar_agenda` já filtra a disponibilidade real do sistema
IXC e nunca retorna um domingo. Esta regra existe pra você NÃO
antecipar verbalmente um dia que o sistema vai rejeitar. Sempre alinhe
a fala com a tool — se prometeu sábado, confirme via `consultar_agenda`
antes de oficializar.$$,
  updated_at = now()
where name = 'Bianca'
  and system_prompt not like '%# ⚠️ REGRA OPERACIONAL — DIAS DE INSTALAÇÃO%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
select
  name,
  length(system_prompt) as chars,
  case when system_prompt like '%# ⚠️ REGRA OPERACIONAL — DIAS DE INSTALAÇÃO%'    then '✓' else '✗' end as bloco_aplicado,
  case when system_prompt like '%Texnet NÃO instala aos domingos%'                 then '✓' else '✗' end as regra_explicita,
  case when system_prompt like '%NUNCA confirme domingo%'                          then '✓' else '✗' end as regra_nunca,
  case when system_prompt like '%conseguimos no sábado ou na segunda-feira%'       then '✓' else '✗' end as alternativa_pronta,
  case when system_prompt like '%Frases que NÃO podem aparecer%'                   then '✓' else '✗' end as exemplos_proibidos
from agents where name = 'Bianca';
