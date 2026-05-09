# M3 — Skills Runtime (uso operacional)

Status: **runtime entregue** — atrás de feature flag, default OFF.

> Pré-requisito: **migration 008_skills.sql** aplicada no banco do agente
> (PR #31 / schema `agent_skills` + `skills`). Sem o schema, o loader degrada
> silenciosamente — não quebra o worker, apenas não aplica skills.

## Habilitar skills em runtime

No worker, defina a env var:

```bash
M3_SKILLS_ENABLED=true
```

Sem essa flag o loader é no-op. **Bianca em produção continua intocada
até essa flag ser ligada.**

## Instalar uma skill num agente

```sql
-- Pega o slug da skill desejada
select id, slug, name from skills where is_public order by slug;

-- Instala na Bianca
insert into agent_skills (agent_id, skill_id, enabled)
select 'agent-id-bianca', id, true
from skills where slug = 'consulta-viabilidade-isp';
```

A partir do próximo turno (worker lê do DB a cada job), a Bianca já carrega
o `prompt_fragment` da skill no fim do system prompt e adiciona
`required_tools` no set de tools disponíveis.

## Como o loader monta o prompt final

```
[system_prompt do agent]

[stateReminder injetado pelo state-machine]

[prompt_fragment da skill A]

[prompt_fragment da skill B]
...
```

Ordem das skills: alfabética por `slug` (ajuda prompt cache da Anthropic
manter prefix estável).

## Como o loader monta as tools

```
tools = unique([
  ...agent.tools (base),
  ...skillA.required_tools,
  ...skillB.required_tools,
])
```

Tools duplicadas são deduplicadas pelo `Set`. Se uma skill pede uma tool
que não existe na tabela `tools`, o dispatcher retorna erro estruturado
quando o LLM tentar chamar — não é fatal.

## Desativar skill sem desinstalar

```sql
update agent_skills set enabled = false
where agent_id = 'agent-id-bianca' and skill_id = '<id>';
```

Útil pra rollback rápido se uma skill estiver afetando uma conversa.
Próximo turno já não aplica.

## Logs de operação

Quando o loader roda com flag ligada, emite:

```
[skill-loader] agent=<id> applied=2 skills=[consulta-viabilidade-isp,escalacao-humano-padrao]
```

Se o `prompt_fragment` de alguma skill exceder 2000 chars:

```
[skill-loader] skill="<slug>" tem prompt_fragment de N chars (>2000). Pode degradar cache.
```

Isso é warning, não erro — só sinaliza que a skill é grande demais e pode
empurrar o prompt total pra fora da janela de cache de 5min da Anthropic.

## Comportamento de fallback

| Cenário | Comportamento |
|---|---|
| `M3_SKILLS_ENABLED` OFF ou ausente | No-op total. `enriched=false`. |
| Flag ON + tabela `agent_skills` não existe | `console.warn`, retorna empty. `enriched=true, applied=0`. |
| Flag ON + agente sem skills | Retorna empty. `enriched=true, applied=0`. |
| Flag ON + erro de DB no meio | `console.warn`, retorna empty. Não trava o turno. |

## Roadmap pendente (M3 final → M4)

- **UI** — página `/skills` no painel + botão "Adicionar skill" no AgentDetail.
- **Editor de config** — form gerado a partir de `config_schema` (hoje config
  só é jsonb cru). Skill que recebe parâmetros (ex: limite de desconto) precisa
  desse editor pra ser configurável sem SQL.
- **Marketplace** (M4) — publicar skill via CLI, validar schema, catálogo
  público.
