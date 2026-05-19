#!/usr/bin/env bash
# ============================================================================
# Thribus Platform — Deploy completo pra produção
# ============================================================================
# Pré-requisitos:
#   - supabase CLI instalada (brew install supabase/tap/supabase)
#   - vercel CLI instalada (npm i -g vercel)
#   - Logado em ambos (supabase login + vercel login)
#   - Variáveis de ambiente exportadas (ver .env.example)
# ============================================================================

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF=<ref>}"
VAULT_KEY="${VAULT_ENCRYPTION_KEY:?Set VAULT_ENCRYPTION_KEY=<32+ chars random>}"

echo "🚀 Thribus Platform — Deploy"
echo "Project: $PROJECT_REF"
echo ""

# ─── 1. Migrations ──────────────────────────────────────────────────────────
echo "📦 1/4 — Aplicando migrations..."
supabase link --project-ref "$PROJECT_REF"
supabase db push

# Vault encryption key — config Postgres
echo "   Configurando vault encryption key..."
supabase db execute --query "alter database postgres set app.vault_key = '$VAULT_KEY';"

# ─── 2. Secrets pras Edge Functions ─────────────────────────────────────────
echo ""
echo "🔐 2/4 — Setando secrets..."
supabase secrets set \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_placeholder}" \
  ASAAS_API_KEY="${ASAAS_API_KEY:-\$aact_placeholder}" \
  ASAAS_BASE_URL="${ASAAS_BASE_URL:-https://api.asaas.com/v3}" \
  IXC_URL="${IXC_URL:-https://placeholder.ixc.com.br/webservice/v1}" \
  IXC_TOKEN="${IXC_TOKEN:-0}" \
  IXC_HASH="${IXC_HASH:-placeholder}" \
  OPENAI_API_KEY="${OPENAI_API_KEY:-sk-placeholder}"

# ─── 3. Edge Functions ──────────────────────────────────────────────────────
echo ""
echo "⚡ 3/4 — Deploy de 11 edge functions..."

# JWT verification on (default) — pra functions chamadas pelo frontend
for fn in stripe-proxy asaas-proxy ixc-proxy knowledge-ingest knowledge-query \
          webhook-dispatch lgpd-export lgpd-erase \
          daily-insights-pipeline reports-generate; do
  echo "   - $fn"
  supabase functions deploy "$fn"
done

# Webhook do Chatwoot — sem JWT (vem de fora)
echo "   - talki-webhook (no-verify-jwt)"
supabase functions deploy talki-webhook --no-verify-jwt

# ─── 4. Scheduled Functions (pg_cron) ───────────────────────────────────────
echo ""
echo "⏰ 4/4 — Configurando pg_cron..."
supabase db execute --query "
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Webhook dispatch a cada 1 minuto
select cron.schedule('webhook-dispatch', '* * * * *',
  \$\$ select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  ) \$\$);

-- Daily insights às 6h da manhã
select cron.schedule('daily-insights', '0 9 * * *',
  \$\$ select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/daily-insights-pipeline',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  ) \$\$);

-- Reports a cada 1 hora (verifica next_run_at)
select cron.schedule('reports-generate', '0 * * * *',
  \$\$ select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/reports-generate',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  ) \$\$);
"

echo ""
echo "✅ Backend deployado. Frontend:"
echo ""
echo "   vercel --prod"
echo ""
echo "   Ou pra Coolify:"
echo "   - Crie um Application apontando pra iStarkCR/thribus-platform"
echo "   - Build: npm run build · Start: npm run preview · Port: 3100"
echo "   - Env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY"
echo ""
echo "🎉 Done."
