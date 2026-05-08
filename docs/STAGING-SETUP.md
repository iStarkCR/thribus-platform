# Staging Setup — Branch `develop` + Schema `staging`

Guia de configuração de ambiente de homologação **sem custo extra de Supabase**.

## Estratégia adotada — Opção A (Schema Separado)

```
Supabase (mesmo projeto)
├── schema "public"  → produção (Bianca/Texnet)
└── schema "staging" → homologação (M1, M2, M3, M4)

Git
├── main      → deploya com schema=public
├── develop   → deploya com schema=staging
└── feature/* → previews com schema=staging
```

**Vantagens vs upgrade Pro:**
- ✅ Custo zero
- ✅ Tudo num lugar — gerencia um banco só
- ✅ Mesmo backup cobre os 2 schemas
- ✅ Mesma instância Coolify, só vars de ambiente diferentes

**Trade-offs:**
- ⚠️ Auto-pause do free tier ainda existe pro projeto
- ⚠️ DB 500MB compartilhado entre prod + staging (planeja seeding pequeno)
- ⚠️ Migration mal feita em "public" pode afetar staging (e vice-versa) — sempre prefixar schema

## Setup passo a passo

### Passo 1 — Criar schema `staging` no Supabase (5 min)

1. Abre https://supabase.com/dashboard → projeto do Thribus Agents
2. SQL Editor → New query
3. Cola **inteiro** o arquivo [`worker/db/migrations/staging/setup.sql`](../worker/db/migrations/staging/setup.sql)
4. Roda
5. No final, vai retornar uma listagem de tabelas em `staging` e os 3 templates seeded

Validação:
```sql
-- Deve listar: agent_templates, agents, conversations, escalations,
-- executions, messages, tool_parameters, tools, workspaces
select tablename from pg_tables where schemaname = 'staging' order by tablename;

-- Deve retornar 3 (vendas-isp, suporte-isp, financeiro-isp)
select count(*) from staging.agent_templates;
```

### Passo 2 — Coolify: app worker staging (10 min)

1. Coolify → New Application
2. Nome: `thribus-worker-staging`
3. Source: mesmo repo (`iStarkCR/thribus-agents`)
4. **Branch: `develop`** (importante)
5. Build path: `worker/`
6. Auto-deploy: **on**
7. Env vars: copia [`worker/.env.staging.example`](../worker/.env.staging.example) e **substitui placeholders**:
   - `SUPABASE_URL` — **mesma URL do prod** (mesmo projeto Supabase)
   - `SUPABASE_SERVICE_ROLE_KEY` — **mesma key do prod**
   - `SUPABASE_SCHEMA=staging` ← **CRÍTICO** (sem isso, bate em prod!)
   - LLM keys, CRM tokens, etc. (use sandbox onde possível)
8. Deploy URL: subdomain separado, ex: `worker-staging.thribustech.com`

⚠️ **Mais importante de tudo**: confirma que `SUPABASE_SCHEMA=staging` está nas env vars **antes** do primeiro deploy. Se faltar, o worker conecta no schema `public` (PROD).

### Passo 3 — Vercel: preview env vars (5 min)

1. Vercel Dashboard → projeto thribus-agents → Settings → Environment Variables
2. Filtro **"Preview"** (não Production)
3. Adiciona/edita:
   - `VITE_SUPABASE_URL` — mesma do prod
   - `VITE_SUPABASE_ANON_KEY` — mesma do prod
   - `VITE_SUPABASE_SCHEMA=staging` ← **CRÍTICO**
4. Próximo deploy de qualquer branch que não seja `main` vai bater no schema staging

### Passo 4 — Mergear PR #27 em develop (1 min)

```bash
gh pr merge 27 --squash --delete-branch
```

Coolify staging detecta o merge → builda → deploya. Vercel atualiza preview de `develop`.

### Passo 5 — Smoke test (5 min)

1. Acessa o preview do Vercel pra `develop` (URL aparece no PR ou no dashboard)
2. Painel → Colaboradores → Novo
3. Deve aparecer **catálogo de 3 templates** (Vendas/Suporte/Financeiro ISP)
4. Clica num template → form preenchido → cria agente fake → confere lista

Valida no banco que foi pra staging (não prod):
```sql
select count(*) from staging.agents;  -- aumentou
select count(*) from public.agents;   -- não mexeu
```

## Como funciona dia-a-dia

```
1. Crio feature/m2-multi-agente (parte de develop)
2. Implemento, commit, push
3. PR feature/m2-multi-agente → develop
4. Merge → Coolify staging deploya automático
5. Testo no preview do Vercel + worker-staging
6. Bug? feature/fix-x → PR pra develop → testa de novo
7. Quando develop tem M1+M2+M3+M4 estáveis (semanas):
   PR develop → main → produção atualiza
```

## Checklist

- [ ] Rodar `worker/db/migrations/staging/setup.sql` no Supabase → cria schema + tabelas + seeds
- [ ] Criar app worker staging no Coolify (branch `develop`, schema `staging`)
- [ ] Adicionar env vars no Vercel "Preview" com `VITE_SUPABASE_SCHEMA=staging`
- [ ] Mergear PR #27 (M1) em `develop`
- [ ] Validar staging: tem 3 templates, criar agente fake funciona

## Custo

| Item | Valor |
|---|---|
| Supabase (Free tier — mesmo projeto) | R$ 0 |
| Coolify (mesma VPS, container adicional) | ~R$ 0 |
| Vercel preview deploys | R$ 0 (Hobby plan) |
| **Total** | **R$ 0** ✅ |

## Quando migrar pra Pro

- Se DB passar de **400MB** (estourou os 500MB do free)
- Se a Bianca em produção começar a ter latência por auto-pause
- Quando atingir **3+ clientes** ativos
- Se precisar SSO/audit logs (Pro tem básico, Team é completo)

Pra agora, schema separado resolve 100%.

## Migrations em ordem (referência)

Rodadas em `public` (prod) — todas já aplicadas:

| # | Arquivo | Status |
|---|---|---|
| 1 | `schema.sql` | ✅ Aplicada |
| 2 | `002_workspaces.sql` | ✅ |
| 3 | `003_conversation_state.sql` | ✅ |
| 4 | `004_audio_out_enabled.sql` | ✅ |
| 5 | `005_tool_auth.sql` | ✅ |
| 6 | `006_agent_templates.sql` | ✅ (M1, em PR #26 já mergeado parcialmente) |

Em `staging` — basta rodar o `setup.sql` único:

| # | Arquivo | Aplicação |
|---|---|---|
| — | `staging/setup.sql` | Cria schema `staging` + clones de todas as tabelas + seeds dos templates |

Próximas migrations terão 2 versões — uma pra `public` e uma pra `staging` (ou um único arquivo schema-aware com `set search_path`):

- M2: `007_agent_routes.sql` + `staging/007_agent_routes.sql`
- M3: `008_skills.sql` + `staging/008_skills.sql`
- M4: `009_billing.sql` + `staging/009_billing.sql`
