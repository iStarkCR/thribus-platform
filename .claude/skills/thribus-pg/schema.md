# thribus_staging — Schema Reference

Referência das tabelas no Postgres self-hosted (database `thribus_staging`).

## Tabelas (9)

Todas em schema `public`. RLS desabilitada — cliente é o worker que conecta com `postgres` superuser via socket. Em prod, ativar RLS é importante.

### `agents` — colaboradores digitais

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| name | text | "Bianca", "Renata", "Marcos" |
| client | text | "TexNet" — escopo de tools |
| sector | text | "Vendas", "Suporte" — UI label |
| type | text | `modular` \| `operacional` \| `enterprise` |
| status | text | `online` \| `standby` \| `offline` |
| model | text | "gpt-4o-mini", "claude-haiku-4-5-..." |
| system_prompt | text | prompt base do agent |
| tools | text[] | nomes das tools liberadas |
| channel | text UNIQUE | "texnet-duall" — slug do canal CRM |
| workspace_id | text FK→workspaces | |
| audio_out_enabled | boolean | TTS quando user manda áudio |
| **role** ⭐ | text | **M2 — `sales`/`support`/`finance`/`retention`/`generic`** |
| stats_today, stats_resolution, stats_avg_response_time, stats_escalated | num | **legacy** — stats reais vêm de `executions` |

### `agent_templates` ⭐ M1 — templates pré-prontos pra criar agente

| coluna | tipo |
|---|---|
| id | text PK |
| slug | text UNIQUE — "vendas-isp", "suporte-isp", "financeiro-isp" |
| name | text — "Vendedor ISP (Bianca)" |
| sector | text — "isp", "clinica", "ecommerce" |
| description | text |
| base_prompt | text — system_prompt template (com variáveis `{NOME_AGENTE}`, etc.) |
| default_tools | text[] |
| default_model | text |
| icon | text — emoji ou nome de ícone |
| is_public | boolean |

Seeds atuais (3): `vendas-isp` 🎯, `suporte-isp` 🛠️, `financeiro-isp` 💰.

### `workspaces` — multi-tenant

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| name | text | "Texnet", "Provedor X" |
| llm_provider | text | `openai` \| `anthropic` |
| llm_api_key | text | **sensível** |
| crm_provider | text | `talki` \| `texnet` |
| crm_base_url, crm_account_id, crm_api_token | text | config do CRM |
| texnet_bot_sender_id, talki_required_label | text | configs CRM-específicas |
| credentials | jsonb | cofre de tokens (`ixc_token`, `hubspot_key`, etc.) |
| **router_config** ⭐ | jsonb | **M2** — config do roteador multi-agente |

`router_config` tem schema:
```json
{
  "enabled": true,
  "model": "gpt-4o-mini",
  "router_prompt": "Classifique a intenção...",
  "intents": {
    "sales": "agent-id-bianca",
    "support": "agent-id-renata",
    "finance": "agent-id-marcos"
  },
  "fallback_agent_id": "agent-id-bianca"
}
```

### `tools` — endpoints HTTP que agente pode invocar

| coluna | tipo |
|---|---|
| id | text PK |
| name | text UNIQUE (snake_case) |
| description | text |
| endpoint | text |
| method | text — GET/POST/PUT/PATCH/DELETE |
| scope | text — `global` ou nome de cliente |
| active | boolean |
| auth_type | text — `basic`/`bearer`/`apikey`/null |
| auth_credentials | jsonb — refs simbólicas |
| extra_headers | jsonb — headers fixos |

### `tool_parameters`
Schema dos parâmetros (não usado pelo dispatcher — schemas hardcoded em `worker/src/agent/tool-schemas.ts`).

### `conversations` — sessão de chat

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| agent_id | text FK | **muda durante conversa em M2** quando há transferência |
| external_id | text UNIQUE | lead.id no Talki/TexNet |
| customer_phone, customer_name | text | |
| status | text | `active`/`escalated`/`closed` |
| current_state | text | estado da state machine (`01_qualification`, `11_completed`...) |
| state_data | jsonb | dados coletados (cpf, nome, plano_id...) |
| state_updated_at | timestamptz | |
| **transferred_from_agent_id** ⭐ | text | **M2** — agent_id anterior antes da transferência |
| **transferred_at** ⭐ | timestamptz | **M2** |
| **transfer_reason** ⭐ | text (max 500) | **M2** — motivo da transferência |

### `messages` — turnos da conversa

| coluna | tipo |
|---|---|
| id | text PK |
| conversation_id | text FK |
| role | text — `user`/`assistant`/`tool` |
| content | text — **possivelmente PII** |
| tool_call_id, tool_name | text |
| tokens_in, tokens_out | int |
| cache_hit | boolean — Anthropic prompt cache |
| created_at | timestamptz |

Indexado por `conversation_id` + `created_at desc`.

### `executions` — resumo por turno

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| agent_id | text FK | **M2** — refletindo o agente que de fato atendeu (post-transfer) |
| conversation_id | text FK | |
| customer_phone, customer_name | text | |
| status | text | `resolved`/`escalated`/`failed`/`running` |
| tools_used | text[] | |
| response_time_ms | int | |
| total_tokens, cache_read_tokens | int | |
| cost_usd | numeric | computado em runtime no worker |

⚠️ M2 mapeia `transferred → resolved` no save (schema só tem 4 status).

### `escalations`
Quando agent escala pra humano. Campos: id, agent_id (do agente que escalou), conversation_id, reason, priority, resolved_at.

## Convenções

- IDs: text com default `gen_random_uuid()::text`
- Timezone: tudo em UTC. Pra Brasília: `at time zone 'America/Sao_Paulo'`
- Soft delete: não tem. DELETE é hard.
- Updated_at: trigger `set_updated_at()` em todas as tabelas com esse campo

## Como descobrir mudanças futuras

```sql
-- Lista tabelas
\dt

-- Estrutura de uma tabela
\d+ agents

-- Vê migrations aplicadas (não tem tracking automático — confira por colunas)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'agents'
order by ordinal_position;
```
