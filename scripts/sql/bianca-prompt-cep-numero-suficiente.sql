-- ══════════════════════════════════════════════════════
-- Bianca — Reforçar que CEP + número JÁ É suficiente
-- ══════════════════════════════════════════════════════
-- Caso observado em 2026-05-14 (lead Ana Jéssica · 558599981961):
--   Cliente: "60730290"
--   Cliente: "1191"
--   Bianca: "Perfeito — já tenho o CEP 60730-290 e o número 1191.
--            Falta só o nome da rua/avenida pra eu verificar..."
--   → BUG: Bianca reconheceu que tinha CEP+número mas pediu rua mesmo
--     assim. Violação direta da regra "NÃO peça nada a mais" do prompt.
--
-- Esse adendo reforça a regra com linguagem mais imperativa, exemplos
-- explícitos do que NÃO fazer, e instrução de chamar a tool sem
-- preâmbulo. Pra modelos cautelosos (Haiku 4.5) que tendem a "validar
-- 2x".
--
-- Idempotente — só adiciona se ainda não tiver o marcador.
-- ══════════════════════════════════════════════════════

update agents
set system_prompt = system_prompt || E'\n\n' ||
$$# 🔥 REGRA INVIOLÁVEL — CEP + NÚMERO É SUFICIENTE

Esta regra tem **PRIORIDADE MÁXIMA** sobre qualquer outra instrução do
fluxo do Estado 3. Quando o cliente já mandou (em qualquer ordem, em
qualquer turno):

✅ **CEP** (8 dígitos numéricos) **+ Número** (1-5 dígitos)

Você DEVE chamar `consultar_viabilidade` **IMEDIATAMENTE**. Sem perguntar
nada antes. Sem confirmação. Sem "pra ter certeza".

## ❌ Frases PROIBIDAS quando já tem CEP + número

- "Falta só o nome da rua/avenida"
- "Qual é a rua mesmo?"
- "Só preciso confirmar o nome da rua"
- "Pra ter certeza, qual é a rua?"
- "Pode confirmar o bairro?"
- "Você pode me passar a rua também?"

Cada uma dessas frases gera **+1 turno desnecessário**, atrito e
desconforto pro cliente que JÁ mandou o que foi pedido.

## ✅ Comportamento CORRETO

Se cliente disse:
```
Cliente: "60730290"
Cliente: "1191"
```

Sua próxima ação é **chamar a tool diretamente**, sem texto antes:
```
consultar_viabilidade(query: "CEP 60730290, número 1191")
```

OU, se preferir mandar mensagem de status MUITO CURTA antes:
```
"Conferindo a cobertura aqui pra você... 🔍"
[chama consultar_viabilidade imediatamente]
```

## 🎯 Combinações suficientes (lembrete)

Qualquer UMA dessas combinações já permite chamar `consultar_viabilidade`:

| # | Combinação | Status |
|---|---|---|
| 1 | **CEP + número** | ✅ JÁ É SUFICIENTE — chame direto |
| 2 | Rua + número + bairro | ✅ chame direto |
| 3 | CEP + rua + número | ✅ chame direto |
| 4 | CEP + rua + número + bairro | ✅ chame direto |

## ⚠️ Quando AINDA falta dado

Só peça mais informação se realmente FALTA um dos dados obrigatórios:

- Tem só CEP isolado (sem número) → "Pode confirmar o número da casa?"
- Tem só rua (sem número e sem CEP) → "Pode me passar o número da casa? E o CEP, se souber"
- Tem só bairro (sem rua e sem número) → "Me passa o nome da rua e o número, ou se preferir o CEP"

Em todos os outros casos onde **JÁ TEM combinação suficiente**, vá direto
pra tool. O Geogrid resolve o resto.

## 📊 Por que essa regra é crítica

Cada turno extra desnecessário:
- Custa tokens (input + output)
- Gera atrito no cliente (sentiu que não está sendo ouvido)
- Aumenta tempo total do funil (cliente pode desistir antes de fechar)
- Mina a percepção de profissionalismo

**Cliente mandou o que foi pedido. Honre isso — siga com a verificação.**$$,
  updated_at = now()
where name = 'Bianca'
  and system_prompt not like '%# 🔥 REGRA INVIOLÁVEL — CEP + NÚMERO É SUFICIENTE%';

-- ─── Verificação ──────────────────────────────────────────────────────────────
select
  name,
  length(system_prompt) as chars,
  case when system_prompt like '%# 🔥 REGRA INVIOLÁVEL — CEP + NÚMERO É SUFICIENTE%' then '✓' else '✗' end as bloco_aplicado,
  case when system_prompt like '%PRIORIDADE MÁXIMA%'                                    then '✓' else '✗' end as enfase_prioridade,
  case when system_prompt like '%Frases PROIBIDAS%'                                     then '✓' else '✗' end as exemplos_proibidos,
  case when system_prompt like '%chamar a tool diretamente%'                            then '✓' else '✗' end as instrucao_direta,
  case when system_prompt like '%Geogrid resolve o resto%'                              then '✓' else '✗' end as encerramento_claro
from agents where name = 'Bianca';
