# PostgREST self-hosted (Thribus Tech)

Expõe o Postgres self-hosted (`thribus_staging` hoje, `thribus_prod` no futuro)
como API REST compatível com Supabase. O painel/worker conectam via `supabase-js`
apontando pra essa URL em vez do Supabase managed.

## Setup em 3 passos

### Passo 1 — Rodar o bootstrap (uma vez, na sua máquina)

```bash
cd ~/Downloads/thribus-agents
bash infra/postgrest/bootstrap.sh
```

O script faz tudo o que **não é UI do Coolify**:
- Aplica `01-roles.sql` no Postgres (cria 4 roles)
- Gera secret JWT + JWTs anon/service_role + senha do authenticator
- Seta a senha do role authenticator no Postgres
- Valida que tudo conecta antes de declarar sucesso
- Imprime no terminal o bloco de env vars exato pra colar no Coolify

⚠️ A saída tem segredos. **Copia direto pro Coolify e gerenciador de senhas.**
Não comite, não cola em chat com IA, não posta em Slack.

### Passo 2 — Criar Service no Coolify

1. **New Resource** → **Service** → **Docker Compose**
2. Cola o conteúdo de `infra/postgrest/docker-compose.yml`
3. Em **Environment Variables**, cola o bloco do bootstrap:
   ```
   PGRST_DB_URI=postgresql://authenticator:...@usicyqipyjfjxap7kgvkw261:5432/thribus_staging
   PG_JWT_SECRET=...
   ```
4. Em **Domains**, configura subdomain (ex: `pg-staging.thribustech.com.br`) → port `3000`
5. Clica **Deploy**

> Se já tinha um Service de tentativa anterior — **deleta antes de criar novo**.
> Não vale a pena tentar consertar.

### Passo 3 — Smoke test (depois que ficar healthy)

```bash
curl -s https://<seu-subdomain>/ | head -c 200
```

Esperado: JSON OpenAPI começando com `{"swagger":"2.0",...}`.

Se 503: container subiu mas DB não responde — re-roda bootstrap (passo 1) ou
veja Troubleshooting abaixo.

---

## Como funciona

```
[Painel React] ──┐
                 ├──→ [PostgREST Coolify] ──→ [Postgres Coolify]
[Worker Node]  ──┘    (subdomain via             (container
                       Traefik, port 3000)        usicyqipyjfjxap7kgvkw261,
                                                  porta 5432 interna)
```

**4 roles seguindo padrão Supabase:**
- `authenticator` — role que faz LOGIN no Postgres. Sem permissions próprias.
  Faz `SET ROLE` pra um dos abaixo conforme JWT recebido.
- `anon` — requests sem JWT. RLS deniega por default.
- `authenticated` — JWT com `role: "authenticated"`. Usuário logado.
- `service_role` — JWT com `role: "service_role"`. **Bypass RLS.** Usado pelo worker.

## Manutenção

### Rotacionar JWTs

Vazou alguma chave? Re-roda o bootstrap:

```bash
bash infra/postgrest/bootstrap.sh
```

Cole o novo bloco no Coolify (sobrescreve env vars antigas) e **Restart**
do Service. JWTs antigos ficam inválidos automaticamente (secret mudou).

### Adicionar nova tabela ao schema

Por causa do `alter default privileges` no `01-roles.sql`, **service_role
ganha automaticamente** SELECT/INSERT/UPDATE/DELETE em qualquer tabela nova.

Pra anon/authenticated, crie policies de RLS na migration da tabela:

```sql
-- Exemplo: anon pode listar skills públicas
create policy "anon_read_public_skills" on skills
  for select to anon
  using (is_public = true);
```

### Logs do PostgREST

```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "docker logs --tail 100 \$(docker ps -q --filter ancestor=postgrest/postgrest:v12.2.3)"
```

## Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| `Bind for 0.0.0.0:PORT failed: port is already allocated` | Compose tentou bindar host port — Coolify usa Traefik, não bindar host | O compose deste repo usa `expose:` (não `ports:`). Confere que não foi editado |
| `could not look up local user ID 1000` | `PGRST_DB_URI` vazia ou nome diferente — libpq cai pra socket fallback | Verificar que env var no Coolify se chama EXATAMENTE `PGRST_DB_URI` |
| HTTP 503 em `/` por mais de 1 min | DB inacessível (rede, password, role) | Re-roda bootstrap; checa logs do container |
| HTTP 401 em endpoints anon | RLS deniega por default — esperado | Criar policies por tabela ou usar service_role |
| `password authentication failed for user "authenticator"` | Senha no `PGRST_DB_URI` não bate com a do role no Postgres | Re-roda bootstrap (vai resincronizar) |
| Container fica em `Created` ou `Exited (128)` | Erro de bind ou network | Ver "Bind ... port is already allocated" acima |
| `relation "skills" does not exist` | Migration 008 não foi aplicada | Rodar `worker/db/migrations/008_skills.sql` no thribus_staging |

## Próximos passos pendentes

- [ ] Criar policies de RLS pra anon/authenticated nas tabelas que o painel usa
- [ ] Adicionar GoTrue (auth de usuários) quando precisar de login real
- [ ] Decidir se aponta painel staging pra cá (`VITE_SUPABASE_URL` swap)
- [ ] Eventualmente migrar prod do Supabase managed pra cá

## Ambientes futuros

Quando subir `thribus_prod` (DB de produção self-hosted), basta rodar de novo:

```bash
PG_DB=thribus_prod bash infra/postgrest/bootstrap.sh
```

E criar outro Service no Coolify com subdomain diferente. Reusa todo o
material — só muda o DB de destino.
