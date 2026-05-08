# Thribus Agents — Schema Reference

Mapeamento das tabelas no Supabase Postgres. Tudo em schema `public`. RLS ativada com policy `all_access` (service role passa direto).

## Tabelas

### `workspaces`
Multi-tenant. Cada cliente tem 1 workspace.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | uuid |
| name | text | "Texnet", "Provedor Y" |
| llm_provider | text | `openai` \| `anthropic` |
| llm_api_key | text | **sensível — não imprimir** |
| crm_provider | text | `talki` \| `texnet` \| null |
| crm_base_url | text | URL do CRM |
| crm_account_id | text | account no CRM |
| crm_api_token | text | **sensível** |
| texnet_bot_sender_id | text | UUID do user TexNet |
| talki_required_label | text | label que filtra conversas (Talki) |
| credentials | jsonb | **sensível** — cofre key→value (`{ixc_token, ixc_hash, hubspot_key}`) |
| created_at, updated_at | timestamptz | UTC |

### `agents`
Cada colaborador digital.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| name | text | "Bianca" |
| client | text | "TexNet" — usado pra escopo de tools |
| sector | text | "Vendas", "Suporte" |
| type | text | `modular` \| `operacional` \| `enterprise` |
| status | text | `online` \| `standby` \| `offline` |
| model | text | "gpt-4o-mini", "claude-haiku-4-5-..." |
| system_prompt | text | prompt base do agent |
| tools | text[] | nomes das tools liberadas (filtra com tools.scope) |
| channel | text UNIQUE | "texnet-duall" — slug do canal CRM |
| workspace_id | text FK→workspaces | |
| audio_out_enabled | boolean | TTS quando user manda áudio |
| stats_today, stats_resolution, stats_avg_response_time, stats_escalated | numérico | **legacy** — stats reais vêm de `executions` agora |
| created_at, updated_at | timestamptz | |

### `tools`
Endpoints HTTP que o agent pode invocar.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| name | text UNIQUE | snake_case (`consultar_cpf`, `cadastro_wizard`) |
| description | text | usada pelo LLM pra decidir invocar |
| endpoint | text | URL completa |
| method | text | GET/POST/PUT/PATCH/DELETE |
| scope | text | `global` ou nome do client (case-insensitive) |
| active | boolean | |
| auth_type | text | `basic` \| `bearer` \| `apikey` \| null (sem auth) |
| auth_credentials | jsonb | refs simbólicas: `{username_ref, password_ref, token_ref, header_name, value_ref}` — apontam pra `workspaces.credentials` |
| extra_headers | jsonb | headers fixos (ex: `{"ixcsoft":"listar"}`) |

### `tool_parameters`
Schema dos parâmetros de cada tool (não usado pelo dispatcher hoje — schemas hardcoded em `worker/src/agent/tool-schemas.ts`).

### `conversations`
Sessão de chat com um cliente.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| agent_id | text FK→agents | |
| external_id | text UNIQUE | lead.id no Talki/TexNet |
| customer_phone | text | |
| customer_name | text | |
| status | text | `active` \| `escalated` \| `closed` |
| current_state | text | estado da state machine (`01_qualification`, `11_completed`, etc) |
| state_data | jsonb | dados coletados na conversa (cpf, nome, plano_id, wizard_contrato_id...) |
| state_updated_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### `messages`
Histórico de cada turno.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| conversation_id | text FK→conversations | |
| role | text | `user` \| `assistant` \| `tool` |
| content | text | **possivelmente sensível** — pode ter CPF, endereço |
| tool_call_id | text | pra role=`tool` |
| tool_name | text | |
| tokens_in, tokens_out | int | |
| cache_hit | boolean | prompt cache hit (Anthropic) |
| created_at | timestamptz | |

Indexado por `conversation_id` e `created_at desc`.

### `executions`
Resumo de cada turno (1 row por mensagem do user processada). Fonte da verdade pras stats da UI.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | uuid |
| agent_id | text FK→agents | |
| conversation_id | text FK→conversations | |
| customer_phone | text | |
| customer_name | text | |
| status | text | `resolved` \| `escalated` \| `failed` \| `running` |
| tools_used | text[] | nomes das tools chamadas no turno |
| response_time_ms | int | duração do turno |
| total_tokens | int | tokens_in + tokens_out |
| cost_usd | numeric | calculado em runtime no worker |
| created_at | timestamptz | |

### `escalations`
Quando o agent passa pra humano.

| coluna | tipo | nota |
|---|---|---|
| id | text PK | |
| agent_id | text FK→agents | |
| conversation_id | text FK→conversations | |
| customer_phone, customer_name | text | |
| reason | text | "cliente solicitou", "circuit breaker", "sem cobertura" |
| priority | text | `low` \| `medium` \| `high` \| `critical` |
| resolved_at | timestamptz nullable | null = pendente |
| created_at | timestamptz | |

Index parcial `where resolved_at is null` pra listar pendentes rápido.

## Relacionamentos

```
workspaces 1───* agents
agents     1───* conversations 1───* messages
                                ╰──* executions
                                ╰──* escalations
tools (independente — agents.tools[] referencia tools.name)
```

## Convenções

- **Time zone**: tudo gravado em UTC (`timestamptz`). Pra display em Brasília: `at time zone 'America/Sao_Paulo'`.
- **IDs**: text com default `gen_random_uuid()::text` (não bigint).
- **Soft delete**: não tem. Delete é hard.
- **Updated_at**: trigger automático em todas as tabelas com `set_updated_at()`.
