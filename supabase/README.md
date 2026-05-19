# Supabase — Migrations & Edge Functions

Backend real do Thribus Platform. Sem deploy = frontend cai em mock.

## Setup inicial

```bash
# Install CLI (uma vez)
brew install supabase/tap/supabase

# Link com projeto
supabase login
supabase link --project-ref <project-ref>
```

## Migrations

```bash
# Aplicar todas as migrations no DB remoto
supabase db push

# Resetar local (cuidado)
supabase db reset
```

**Migrations atuais (aplicar em ordem):**
- `20260517_inbox.sql` — `inbox_conversations` + `inbox_messages` + trigger de atividade
- `20260517_customer360.sql` — `customer_profiles` + `customer_facts` + `customer_interactions` + `customer_contracts`
- `20260517_notifications.sql` — `notifications` com RLS workspace-aware
- `20260517_knowledge.sql` — pgvector + `knowledge_bases` + `knowledge_sources` + `knowledge_chunks` + RPC `match_knowledge_chunks`
- `20260518_webhooks_outbound.sql` — `outbound_webhooks` + `webhook_deliveries` + trigger SQL que enfileira eventos
- `20260518_vault.sql` — `workspace_secrets` (pgcrypto) + `api_keys` (sha256) + RPCs upsert/rotate/create
- `20260518_lgpd.sql` — DSR + consent log + PII scanner com trigger automático
- `20260518_experiments.sql` — A/B com RPC `experiment_significance` (z-score) + `pick_experiment_variant` (sticky)
- `20260518_studio.sql` — `studio_canvases` JSONB + versionamento por publish

## Edge Functions

### 1. `talki-webhook` — ingere mensagens do Chatwoot/Talki

```bash
# Deploy (sem JWT — Chatwoot é serviço público)
supabase functions deploy talki-webhook --no-verify-jwt

# URL pública:
# https://<project>.supabase.co/functions/v1/talki-webhook?workspace=<workspace_uuid>
```

**Setup no Chatwoot:**
1. Settings → Integrations → Webhooks → Add
2. URL: a acima com `?workspace=<uuid>` do workspace
3. Events: `message_created`, `conversation_created`, `conversation_status_changed`

### 2. `stripe-proxy` — proxy seguro pra Stripe API

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase functions deploy stripe-proxy
```

Frontend chama via `supabase.functions.invoke('stripe-proxy', { body: { action, params } })`.

### 3. `asaas-proxy` — proxy seguro pra Asaas API (BR)

```bash
supabase secrets set ASAAS_API_KEY=$aact_prod_xxx
supabase secrets set ASAAS_BASE_URL=https://api.asaas.com/v3
# Em homologação: ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3

supabase functions deploy asaas-proxy
```

### 4. `ixc-proxy` — proxy seguro pra IXC (ERP de ISP)

```bash
supabase secrets set IXC_URL=https://provedor.ixc.com.br/webservice/v1
supabase secrets set IXC_TOKEN=8
supabase secrets set IXC_HASH=abc123...
supabase functions deploy ixc-proxy
```

### 5. `knowledge-ingest` + `knowledge-query` — RAG semântico

```bash
supabase secrets set OPENAI_API_KEY=sk-xxx
supabase functions deploy knowledge-ingest
supabase functions deploy knowledge-query
```

Usa `text-embedding-3-small` (1536 dims, $0.02/M tokens).

### 6. `webhook-dispatch` — processa fila de webhooks outbound

```bash
supabase functions deploy webhook-dispatch
```

Roda em cron (Supabase Scheduled Functions ou pg_cron):
```sql
select cron.schedule('webhook-dispatch', '* * * * *',
  $$ select net.http_post(
    url := 'https://<proj>.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  ) $$);
```

Retry exponencial: 1m, 5m, 30m, 4h, 24h. Após 5 tentativas, marca `failed`.
HMAC SHA-256 nos headers `X-Thribus-Signature`.

### 7. `lgpd-export` + `lgpd-erase` — direitos do titular (Art. 18)

```bash
supabase functions deploy lgpd-export
supabase functions deploy lgpd-erase
```

`lgpd-export` consolida TODOS os dados do titular em JSON único (customer_profiles, facts, conversations, messages, consent_log, pii_detections).

`lgpd-erase` anonimiza (não deleta) preservando registros agregados pra dever legal.

### 8. Vault — encriptação no DB

Setar a chave de encriptação simétrica do Postgres (pgcrypto):
```sql
alter database postgres set app.vault_key = 'sua_chave_forte_de_32_chars_min';
```

Frontend NUNCA recebe `value_encrypted` — só `masked_value`. Decriptação só
dentro do worker via RPC `vault_decrypt`.

## Smoke tests

```bash
# Stripe — listar customers (precisa STRIPE_SECRET_KEY válida)
curl -X POST 'https://<project>.supabase.co/functions/v1/stripe-proxy' \
  -H 'Authorization: Bearer <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"action":"customers.list","params":{"limit":3}}'

# Asaas — listar customers
curl -X POST 'https://<project>.supabase.co/functions/v1/asaas-proxy' \
  -H 'Authorization: Bearer <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"action":"customers.list","params":{"limit":3}}'

# Talki webhook (simular evento do Chatwoot)
curl -X POST 'https://<project>.supabase.co/functions/v1/talki-webhook?workspace=<uuid>' \
  -H 'Content-Type: application/json' \
  -d '{"event":"message_created","id":1,"content":"oi","message_type":"incoming","conversation":{"id":42,"status":"open","channel":"whatsapp","meta":{"sender":{"name":"João","phone_number":"+5553988776655"}}}}'
```

## Após deploy

No frontend, badges no header mudam de `mock` → `live`:
- `/billing` — Stripe + Asaas
- `/inbox` — Talki via webhook
- `/optimizer` — Cost analytics (já lê tabela `executions` direto)

Cada página detecta automaticamente — sem flag manual.
