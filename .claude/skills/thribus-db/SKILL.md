---
name: thribus-db
description: Consulta e analisa o banco Postgres do Thribus Agents (Supabase) via psql. Use sempre que o usuário pedir pra investigar conversas, executions, custo de tokens, escalações, performance de agentes, debug de fluxos, ou qualquer pergunta sobre dados que estão no Supabase do projeto Thribus Agents. Mesmo se o usuário não falar "banco" explicitamente — perguntas como "quantas conversas a Bianca atendeu hoje?", "quais tools mais falham?", "qual cliente teve mais escalações esta semana?" devem disparar essa skill.
type: data-access
---

# Thribus Agents — Acesso ao Banco

Skill pra consultar o Postgres do Thribus Agents (Supabase) via psql, analisar dados e responder perguntas operacionais.

## Quando usar

Sempre que o Charles (ou usuário do projeto) perguntar sobre:
- **Conversas**: "quantas a Bianca atendeu?", "qual cliente travou no estado X?", "histórico do telefone Y"
- **Executions**: "qual tool mais falhou?", "tempo médio de resposta?", "quanto gastei em tokens?"
- **Escalações**: "quais escalações pendentes?", "motivo mais comum?"
- **Agents/Tools/Workspaces**: configuração, prompt, status
- **Performance**: agentes mais usados, horários de pico, custos por workspace

Não usar pra: alterações de prompt (vai por SQL no `scripts/sql/`), criar/deletar agents (faz pelo painel).

## Setup inicial (1x)

Antes da primeira consulta, garante que o arquivo de credencial existe em `~/.thribus/db.env`. Se não existir, peça ao usuário pra criar:

```bash
mkdir -p ~/.thribus
cat > ~/.thribus/db.env <<'EOF'
# Connection string do Supabase
# Pegue em: Project Settings → Database → Connection string → URI
# Recomendado: criar role read-only no Supabase e usar essa senha aqui
export DATABASE_URL="postgresql://postgres.PROJECT_ID:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
EOF
chmod 600 ~/.thribus/db.env
```

**Recomendação de segurança**: criar uma role read-only no Supabase em vez de usar a service role. Cole isso no SQL Editor do Supabase 1x:

```sql
create user claude_readonly with password 'TROCAR_POR_SENHA_FORTE';
grant connect on database postgres to claude_readonly;
grant usage on schema public to claude_readonly;
grant select on all tables in schema public to claude_readonly;
alter default privileges in schema public grant select on tables to claude_readonly;
```

Aí na connection string usa `claude_readonly:SENHA` em vez de `postgres:PASSWORD`. Assim mesmo que algum query tente UPDATE/DELETE acidental, o banco rejeita.

## Como executar queries

Sempre rode via Bash com:

```bash
source ~/.thribus/db.env && psql "$DATABASE_URL" -c "SELECT ..."
```

Pra queries longas, use heredoc:

```bash
source ~/.thribus/db.env && psql "$DATABASE_URL" <<'SQL'
select agent_id, count(*) as total
from executions
where created_at > now() - interval '7 days'
group by agent_id
order by total desc;
SQL
```

Pra ver estrutura de tabela:
```bash
source ~/.thribus/db.env && psql "$DATABASE_URL" -c "\d+ executions"
```

## Regras de operação

### 1. Read-only por default
Toda query é SELECT. Se o usuário pedir UPDATE/DELETE/INSERT, **mostre primeiro o que vai mudar** (com SELECT equivalente) e peça confirmação antes de executar. Use a role `claude_readonly` se possível — ela rejeita writes automaticamente.

### 2. Sempre aplicar LIMIT em SELECTs grandes
Tabelas como `messages`, `executions`, `conversations` podem ter milhares de rows. Sempre adicione `LIMIT 100` por default quando o usuário não especifica. Avise se truncou.

### 3. Resumir, não despejar
Quando trouxer 50+ rows, agregue (group by, count, avg) em vez de listar tudo. Se o usuário quer ver linha-a-linha, ele pede explícito.

### 4. Datas em formato Brasília (UTC-3)
O banco grava em UTC. Pra apresentar pro usuário, converte:
```sql
to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
```

### 5. Não vazar dados sensíveis
Não imprima na resposta:
- `workspaces.credentials` (jsonb com tokens IXC, hubspot, etc)
- `workspaces.crm_api_token`, `workspaces.llm_api_key`
- Conteúdo de `messages.content` em massa (pode ter dados pessoais — CPF, endereço, etc). Quando precisar inspecionar, mostre tipo "primeira mensagem do telefone XXX" caso a caso.

Se precisar contar/agregar essas colunas, OK. Não imprima valor.

### 6. Identificadores
- **Agent**: filtre por `name ilike 'bianca%'` ou `client = 'TexNet'`
- **Conversa**: pelo `external_id` (lead.id no CRM) ou `customer_phone`
- **Execução**: pelo `id` (uuid) ou `conversation_id`

## Estrutura

Em casos comuns, basta o que está aqui. Pra detalhes:
- **`schema.md`** — referência completa das tabelas, colunas, FKs
- **`queries.md`** — queries prontas pra perguntas frequentes (dashboard, debug, custo)

Carregue esses arquivos quando precisar. Não precisa carregar pra perguntas simples (`select count(*) from executions where status='escalated'`).

## Anti-padrões

❌ **Não faça `select *` em tabelas grandes** — peça as colunas que precisa.

❌ **Não rode multiple statements sem revisar.** Cada `psql -c "..."` é uma transação.

❌ **Não tente abrir conexão persistente** ou ficar "conectado". Cada query é uma chamada `psql` nova.

❌ **Não execute DDL sem aviso explícito do usuário.** `CREATE TABLE`, `DROP`, `ALTER` exigem confirmação por escrito.

✅ **Verifique antes de inferir.** Se o usuário disser "Bianca atendeu 50 ontem" e o banco diz 47, mostre o que viu — não confie em valores citados de memória.

✅ **Quando algo não bate**, mostra a query usada. Facilita o usuário corrigir o filtro.

## Fluxo típico de uma sessão

1. Usuário pergunta: "quanto gastei em tokens com a Bianca essa semana?"
2. Você lê `queries.md` → acha a query de custo
3. Roda via Bash com `psql`
4. Resume o resultado em prosa: "R$ X,XX em N execuções, ticket médio Y"
5. Se for relevante, oferece drill-down: "quer ver por dia? por hora?"
