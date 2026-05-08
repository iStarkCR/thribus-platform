# M3 — Skills empacotadas (roadmap)

Status: **scaffold** (schema + tipos prontos, runtime ainda não conectado).

## O que é uma skill?

Diferente de:
- **Tool** — endpoint HTTP individual (`consultar_viabilidade`, `gerar_boleto`).
- **Template** — agente pronto, criado uma vez (`vendas-isp` → instância nova de Bianca).

Uma **skill** é um *módulo* que se adiciona a um agente existente combinando:
- **prompt_fragment** — texto que vai concatenado no `system_prompt` do agent.
- **required_tools** — lista de tools necessárias (referencia tools já existentes).
- **config_schema** — parâmetros configuráveis por agente (ex: limite de desconto, mensagem custom).

Exemplo: um agente "Vendedor ISP" recebe a skill `cobranca-amigavel` e passa a saber lidar com inadimplência sem virar outro agente.

## Schema (já aplicável)

Migration `008_skills.sql`:
- `skills` — definição da skill (pública ou privada por workspace).
- `agent_skills` — N:N entre agentes e skills, com `config` jsonb e `enabled`.
- 2 seeds built-in: `consulta-viabilidade-isp`, `escalacao-humano-padrao`.

Aplicação em staging:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 << 'EOF'
docker exec -i usicyqipyjfjxap7kgvkw261 psql -U postgres -d thribus_staging \
  < /tmp/008_skills.sql
EOF
```

## O que falta — M3-runtime (próxima sessão)

### 1. Worker — `agent/skill-loader.ts`
Antes de montar o `system_prompt` final no `loop.ts`, carregar skills habilitadas:
```ts
const skills = await db.agentSkills.findEnabledByAgent(agent.id);
const promptWithSkills = [agent.systemPrompt, ...skills.map(s => s.promptFragment)].join('\n\n');
const toolsWithSkills = unique([...agent.tools, ...skills.flatMap(s => s.requiredTools)]);
```

### 2. DB layer — `worker/src/db/index.ts`
Adicionar `db.skills.list()` e `db.agentSkills.findEnabledByAgent(agentId)`.

### 3. Frontend — catálogo de skills
- Página `/skills` (listagem de built-in + por workspace)
- Botão "Adicionar skill" no AgentDetail
- Toggle ativar/desativar instância
- Editor de `config` (form gerado a partir de `config_schema`)

### 4. CLI / Marketplace (M4)
- `thribus skill publish ./minha-skill.yaml`
- Validador de skills (testa numa conversa simulada antes de publicar)
- Catálogo público de skills da comunidade

## Por que scaffold antes do runtime?

Aplicar migration cedo permite:
- Time interno começar a desenhar skills mesmo antes de virem ativas.
- Coletar feedback do shape (`prompt_fragment` é suficiente? precisa de hooks de evento?).
- Evitar mexer no `agent/loop.ts` (que está estável servindo a Bianca em produção) sem necessidade — runtime entra quando houver pelo menos 3-4 skills validadas no schema.

## Anti-padrões a evitar quando o runtime chegar

- **Não aplicar skills retroativamente em todos os agentes** — opt-in por agente.
- **Não permitir skill com prompt_fragment >2000 chars** — system_prompt fica gigante e degrada cache.
- **Não fazer skills com side-effects no install** (ex: rodar SQL, criar tools) — instalar skill deve ser barato e reversível.
- **Não duplicar tools** — se duas skills pedem `consultar_cpf`, deduplicar ao montar tool set.
