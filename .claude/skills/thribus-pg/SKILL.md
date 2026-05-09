---
name: thribus-pg
description: Consulta e analisa o Postgres self-hosted da Thribus Tech (containerizado no Coolify da VPS Contabo). Hospeda os databases thribus_staging (M1/M2/M3/M4 do bot Bianca em homologação), thribus_prod (futuro — prod do bot quando migrar), e talki_prod (Talki/Chatwoot do TexNet quando migrar). Use sempre que o usuário pedir consulta/análise nesses databases — agentes, conversas, templates, roteamento multi-agente, métricas. Acessa via SSH + docker exec — não precisa de senha porque conecta via socket interno do container.
type: data-access
---

# Thribus Postgres Self-hosted (Coolify VPS)

Skill pra consultar o Postgres rodando na VPS Contabo da Thribus Tech.

## ⚠️ Diferenciação das outras skills de DB

| Skill | Banco | Quando usar |
|---|---|---|
| **`thribus-pg`** (esta) | Postgres self-hosted Coolify | Staging do bot, futuros sistemas Thribus, Talki migrado |
| `thribus-db` | Supabase managed (cloud) | **Prod ATUAL da Bianca** (Texnet em produção) |
| `ixc-db` | MariaDB IXC TexNet | Sistema do cliente (clientes/contratos/faturas reais) |
| `thribus-vps` | SSH genérico VPS | Operações de infra (Docker, Coolify, logs) |

**Hoje (Maio 2026):**
- **Bianca em produção** ainda está no Supabase managed → use `thribus-db`
- **M1/M2 testes** estão em `thribus_staging` no Postgres self-hosted → use `thribus-pg` (esta)
- **Migração prod planejada** quando M2 estabilizar (~3 meses)

Quando a migração for feita, `thribus-pg` passa a cobrir tudo e `thribus-db` (Supabase managed) some.

## Setup necessário

A skill **depende da `thribus-vps`** (SSH key configurada em `~/.ssh/thribus_vps` + permission rule). Tudo que precisa pra essa skill funcionar é:

1. ✅ SSH key configurada (já feito — vide `thribus-vps/SKILL.md`)
2. ✅ Permission rule no `.claude/settings.local.json` (`Bash(ssh -i ~/.ssh/thribus_vps root@147.93.131.93 *)`)
3. ✅ Container Postgres rodando: `usicyqipyjfjxap7kgvkw261` (supabase/postgres:17.4.1.032)

Validação rápida:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "docker exec usicyqipyjfjxap7kgvkw261 psql -U postgres -c 'select version();'"
```

## Como executar queries

Padrão (via `docker exec`, sem senha — usa socket interno):

```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "docker exec usicyqipyjfjxap7kgvkw261 psql -U postgres -d <DATABASE> -c \"<SQL>\""
```

Pra queries longas, heredoc:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 << 'EOF'
docker exec -i usicyqipyjfjxap7kgvkw261 psql -U postgres -d thribus_staging << 'SQL'
select current_state, count(*) as conversas
from conversations
where created_at > now() - interval '7 days'
group by 1 order by 1;
SQL
EOF
```

Pra output formatado em tabela bonita, usar `--table`:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "docker exec usicyqipyjfjxap7kgvkw261 psql -U postgres -d thribus_staging \
     -c '\\dt' --table"
```

## Databases disponíveis

| Database | Pra que serve | Status |
|---|---|---|
| `thribus_staging` | Homologação dos milestones (M1, M2, M3, M4) do bot Bianca | ✅ Em uso |
| `thribus_prod` | Produção do bot — **quando migrar do Supabase managed** | 🔮 Vazio, futuro |
| `talki_prod` | Talki/Chatwoot — quando migrar do banco atual | 🔮 Vazio, futuro |
| `postgres` | Database default — não usar |

## Estrutura

Pra detalhes específicos:
- **`schema.md`** — tabelas e novidades dos M1/M2 (agent_templates, agents.role, workspaces.router_config, conversations.transferred_*)
- **`queries.md`** — queries prontas pra debug do bot, métricas, M2 routing

## Regras de operação

### 1. Read-only por default
Toda query é SELECT. Pra UPDATE/DELETE/INSERT, mostre o SQL antes e peça confirmação no chat.

### 2. NÃO confunda com `thribus-db` (Supabase managed)
Hoje o **prod real da Bianca/TexNet** está no Supabase managed (skill `thribus-db`). Esta skill (`thribus-pg`) só cobre staging + futuro. Se o user pergunta sobre conversas reais em produção, use `thribus-db`.

### 3. Sem credencial em chat
Use sempre `docker exec` — não precisa user/senha pq conecta via socket Unix dentro do container. Isso elimina o risco de vazar credencial de Postgres em log.

### 4. Cuidado com FK em DELETE
Postgres tem FK forte. Pra deletar conversation, precisa apagar messages + executions + escalations primeiro. Schema e ordem em `schema.md`.

### 5. Performance
- LIMIT 100 default em listagens
- Use índices: `agents.channel`, `conversations.external_id`, `messages.conversation_id`, `executions.created_at`
- `pg_stat_statements` ativado — `select * from pg_stat_statements order by total_exec_time desc limit 10` ajuda a achar query lenta

## Anti-padrões

❌ Não use `psql` direto via porta exposta — vai pelo proxy nginx que NÃO fala protocolo Postgres. Sempre `docker exec`.

❌ Não execute `DROP DATABASE` — irreversível e mata todos os dados.

❌ Não rode comandos no `postgres` (database default) — use os nomeados (`thribus_staging` etc.) pra não poluir.

✅ Sempre `--table` em outputs que vão pro chat — fica legível.

✅ Em queries com PII (mensagens de cliente), agregue ou mascare. M2 ainda não tem RLS configurado.

## Backup automático

Configurado via cron (`/usr/local/bin/thribus-backup.sh`):
- Roda diário às 3h
- pg_dump custom format comprimido (`-Fc -Z 9`) de cada DB
- Salva em `/var/backups/thribus/postgres/YYYY-MM-DD/`
- Retenção: 30 dias
- Quando contratar Object Storage Contabo, descomenta upload S3 no script

Pra ver últimos backups:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "ls -lh /var/backups/thribus/postgres/$(date +%Y-%m-%d)/"
```

Pra forçar backup agora:
```bash
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 "/usr/local/bin/thribus-backup.sh"
```

## Restore (procedimento)

Em caso de necessidade:
```bash
# Lista backups disponíveis
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 "ls /var/backups/thribus/postgres/"

# Restore (substitui DB atual — CUIDADO)
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 << 'EOF'
docker exec -i usicyqipyjfjxap7kgvkw261 \
  pg_restore -U postgres -d thribus_staging --clean --if-exists \
  < /var/backups/thribus/postgres/2026-05-09/thribus_staging__2026-05-09_004650.dump
EOF
```

⚠️ Restore **não confirma** automaticamente — sempre peça confirmação explícita do user antes.
