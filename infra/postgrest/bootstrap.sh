#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# Bootstrap PostgREST self-hosted — Thribus Tech
# ══════════════════════════════════════════════════════════════════════════
# Configura tudo o que NÃO é interface do Coolify, em uma única execução:
#
#   1. Verifica conexão SSH com a VPS
#   2. Aplica 01-roles.sql (cria authenticator/anon/authenticated/service_role)
#   3. Gera secret JWT + JWTs anon/service_role + senha do authenticator
#   4. Seta a senha do role authenticator no Postgres
#   5. Valida que o role consegue logar e fazer queries
#   6. Imprime o bloco de env vars pronto pra colar no Coolify
#
# Após rodar este script com sucesso, o ÚNICO trabalho manual é:
#   - Coolify → New Resource → Service → Docker Compose
#   - Cola o conteúdo de `docker-compose.yml`
#   - Cola o bloco de env vars que este script imprime
#   - Configura domínio (ex: pg-staging.thribustech.com.br) → port 3000
#   - Clica em Deploy
#
# Uso:
#   bash infra/postgrest/bootstrap.sh
#
# Pode rodar várias vezes — é idempotente. Mas vai gerar JWTs novos cada vez
# (o secret muda). Se quiser reaproveitar, exporte PG_JWT_SECRET antes de rodar.
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ─────────────────────────────────────────────────────────────────
SSH_KEY="${SSH_KEY:-$HOME/.ssh/thribus_vps}"
SSH_HOST="${SSH_HOST:-root@147.93.131.93}"
PG_CONTAINER="${PG_CONTAINER:-usicyqipyjfjxap7kgvkw261}"
PG_DB="${PG_DB:-thribus_staging}"
PG_USER="${PG_USER:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ─────────────────────────────────────────────────────────────────
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
blue()   { printf "\033[34m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
hr()     { printf "%*s\n" 70 "" | tr ' ' '─'; }

step() {
  echo
  bold "━━━ $1"
}

fail() {
  red "✗ $1"
  exit 1
}

ok() {
  green "✓ $1"
}

# ─── Pre-flight ─────────────────────────────────────────────────────────────
step "Pre-flight checks"

[ -f "$SSH_KEY" ] || fail "SSH key não encontrada: $SSH_KEY"
ok "SSH key existe"

command -v node >/dev/null || fail "node não instalado"
ok "node disponível ($(node --version))"

command -v ssh >/dev/null || fail "ssh não instalado"
ok "ssh disponível"

[ -f "$SCRIPT_DIR/01-roles.sql" ] || fail "01-roles.sql não encontrado em $SCRIPT_DIR"
[ -f "$SCRIPT_DIR/generate-jwts.mjs" ] || fail "generate-jwts.mjs não encontrado"
ok "Arquivos auxiliares presentes"

# Testa SSH
ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$SSH_HOST" "echo ok" >/dev/null 2>&1 \
  || fail "SSH falhou — checa key e host"
ok "SSH conecta na VPS"

# Testa Postgres acessível via docker exec
ssh -i "$SSH_KEY" "$SSH_HOST" "docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c 'select 1' >/dev/null 2>&1" \
  || fail "Postgres ($PG_CONTAINER, db $PG_DB) inacessível"
ok "Postgres responde no container $PG_CONTAINER"

# ─── 1. Apply roles SQL ─────────────────────────────────────────────────────
step "Aplicando 01-roles.sql (roles authenticator/anon/authenticated/service_role)"

ssh -i "$SSH_KEY" "$SSH_HOST" "docker exec -i $PG_CONTAINER psql -U $PG_USER -d $PG_DB -v ON_ERROR_STOP=1" \
  < "$SCRIPT_DIR/01-roles.sql" \
  >/tmp/thribus_roles_output.log 2>&1 \
  || { red "✗ Falha aplicando roles. Output:"; cat /tmp/thribus_roles_output.log; exit 1; }

# Verifica que os 4 roles existem
roles_count=$(ssh -i "$SSH_KEY" "$SSH_HOST" \
  "docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -tAc \"select count(*) from pg_roles where rolname in ('anon','authenticated','authenticator','service_role')\"")
[ "$roles_count" = "4" ] || fail "Esperava 4 roles, achou $roles_count"
ok "4 roles configurados"

# ─── 2. Generate JWTs and password ──────────────────────────────────────────
step "Gerando JWT secret + JWTs (anon, service_role) + senha do authenticator"

# Roda generate-jwts.mjs e captura saída
JWT_OUTPUT=$(node "$SCRIPT_DIR/generate-jwts.mjs")

# Extrai cada valor — usa sed pra ficar entre as aspas
PG_JWT_SECRET=$(printf '%s\n' "$JWT_OUTPUT" | grep '^PG_JWT_SECRET=' | sed -E 's/^PG_JWT_SECRET="([^"]+)"$/\1/')
SUPABASE_ANON_KEY=$(printf '%s\n' "$JWT_OUTPUT" | grep '^SUPABASE_ANON_KEY=' | sed -E 's/^SUPABASE_ANON_KEY="([^"]+)"$/\1/')
SUPABASE_SERVICE_ROLE_KEY=$(printf '%s\n' "$JWT_OUTPUT" | grep '^SUPABASE_SERVICE_ROLE_KEY=' | sed -E 's/^SUPABASE_SERVICE_ROLE_KEY="([^"]+)"$/\1/')
PG_AUTHENTICATOR_PASSWORD=$(printf '%s\n' "$JWT_OUTPUT" | grep '^PG_AUTHENTICATOR_PASSWORD=' | sed -E 's/^PG_AUTHENTICATOR_PASSWORD="([^"]+)"$/\1/')

[ -n "$PG_JWT_SECRET" ] || fail "Falhou parsing PG_JWT_SECRET"
[ -n "$PG_AUTHENTICATOR_PASSWORD" ] || fail "Falhou parsing PG_AUTHENTICATOR_PASSWORD"
ok "JWTs e senha gerados (não escritos em disco)"

# ─── 3. Set authenticator password in Postgres ──────────────────────────────
step "Setando senha do role authenticator no Postgres"

# A senha gerada pelo `generate-jwts.mjs` usa base64url ([A-Za-z0-9_-]), sem
# aspas/escapes — então é seguro interpolar direto via psql -c.
# A senha é passada via stdin (heredoc) pro psql usar `\set` + `:'NAME'`
# pra que o psql faça o escape correto e não vaze em listagens de processos.
ssh -i "$SSH_KEY" "$SSH_HOST" \
  "docker exec -i $PG_CONTAINER psql -U $PG_USER -v ON_ERROR_STOP=1" \
  >/tmp/thribus_alter_output.log 2>&1 \
  <<EOF \
  || { red "✗ ALTER ROLE falhou. Output:"; cat /tmp/thribus_alter_output.log; rm -f /tmp/thribus_alter_output.log; exit 1; }
\set new_pw '$PG_AUTHENTICATOR_PASSWORD'
alter role authenticator with password :'new_pw';
EOF

rm -f /tmp/thribus_alter_output.log
ok "Senha do authenticator setada"

# ─── 4. Validate authenticator can login ────────────────────────────────────
step "Validando que authenticator faz login + queries"

# Usa o coolify network porque é onde Postgres está acessível por DNS interno.
# Tenta uma query simples como authenticator → SET ROLE service_role → select.
PG_URI="postgresql://authenticator:${PG_AUTHENTICATOR_PASSWORD}@${PG_CONTAINER}:5432/${PG_DB}"

validation=$(ssh -i "$SSH_KEY" "$SSH_HOST" "docker run --rm --network coolify -e PGPASSWORD='$PG_AUTHENTICATOR_PASSWORD' postgres:17-alpine psql 'host=$PG_CONTAINER port=5432 dbname=$PG_DB user=authenticator' -tAc 'set role service_role; select count(*) from skills where is_public = true' 2>&1" || true)

# Esperado: número de skills públicas (>= 0). Se vier erro, falha.
if printf '%s' "$validation" | grep -qE '^[0-9]+$'; then
  ok "authenticator faz login e SET ROLE service_role lê skills (count=$validation)"
else
  red "✗ Validação falhou. Output:"
  echo "$validation"
  exit 1
fi

# ─── 5. Print env block for Coolify ─────────────────────────────────────────
step "Tudo configurado. Cole o bloco abaixo no Coolify."

cat <<HEREDOC

$(blue "$(hr)")
$(bold "Coolify Service → Environment Variables (cole tudo)")
$(blue "$(hr)")

PGRST_DB_URI=postgresql://authenticator:${PG_AUTHENTICATOR_PASSWORD}@${PG_CONTAINER}:5432/${PG_DB}
PG_JWT_SECRET=${PG_JWT_SECRET}

$(blue "$(hr)")
$(bold "Pra usar o painel/worker apontando neste PostgREST (.env):")
$(blue "$(hr)")

VITE_SUPABASE_URL=https://<seu-subdomain-do-postgrest>
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

$(blue "$(hr)")
$(bold "Próximos passos no Coolify:")
$(blue "$(hr)")

  1. Coolify → New Resource → Service → Docker Compose
  2. Cola o conteúdo de:
       $(yellow "$SCRIPT_DIR/docker-compose.yml")
  3. Em Environment Variables, cola o bloco PGRST_DB_URI + PG_JWT_SECRET
  4. Em Domains, configura subdomain (ex: pg-staging.thribustech.com.br) → port 3000
  5. Clica em Deploy

  Se o Service já existia (deploy anterior travou), DELETE ele e recria.
  Não tente recuperar — limpo é mais rápido.

$(blue "$(hr)")
$(bold "Após deploy, validar com:")
$(blue "$(hr)")

  curl -s https://<seu-subdomain>/ | head -c 200
  $(yellow "(esperado: JSON OpenAPI começando com {\"swagger\":...})")

$(blue "$(hr)")
$(yellow "GUARDE as 4 chaves acima no gerenciador de senhas. Não comite.")
$(yellow "Se vazar, rode este script de novo — JWTs antigos viram inválidos.")
$(blue "$(hr)")

HEREDOC

# Limpeza
rm -f /tmp/thribus_roles_output.log

green "✓ Bootstrap concluído sem erros."
