#!/usr/bin/env bash
# ============================================================================
# Deploy do bridge do Bukowiski — repo → ~/.thribus/bridge (SEGURO)
# ============================================================================
# A cópia que RODA (via launchd) é ~/.thribus/bridge/bukowiski-bridge.mjs.
# Este script mantém repo e produção em sincronia sem risco de apagar lógica:
#   1. valida a sintaxe do repo ANTES de tocar em qualquer coisa
#   2. faz backup datado da cópia de produção
#   3. copia repo → produção e revalida
#   4. só então reinicia o serviço (launchctl)
#
# Regra de ouro: o repo (scripts/bukowiski-bridge.mjs) é a FONTE DA VERDADE.
# Editou a lógica do bridge? Edite no repo e rode este script. Nunca edite só a
# cópia de produção (foi assim que repo e prod divergiram).
# ============================================================================
set -euo pipefail

REPO_BRIDGE="$(cd "$(dirname "$0")/.." && pwd)/scripts/bukowiski-bridge.mjs"
PROD_DIR="$HOME/.thribus/bridge"
PROD_BRIDGE="$PROD_DIR/bukowiski-bridge.mjs"
LABEL="com.thribus.bukowiski-bridge"

[ -f "$REPO_BRIDGE" ] || { echo "❌ repo bridge não encontrado: $REPO_BRIDGE"; exit 1; }

echo "🔎 Validando sintaxe do repo…"
node --check "$REPO_BRIDGE" || { echo "❌ sintaxe inválida — abortado (produção intacta)"; exit 1; }

mkdir -p "$PROD_DIR"
if [ -f "$PROD_BRIDGE" ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  cp "$PROD_BRIDGE" "$PROD_BRIDGE.bak-$TS"
  echo "💾 Backup: bukowiski-bridge.mjs.bak-$TS"
  if diff -q "$REPO_BRIDGE" "$PROD_BRIDGE" >/dev/null; then
    echo "✅ Já idênticos — nada a deployar."
    exit 0
  fi
fi

cp "$REPO_BRIDGE" "$PROD_BRIDGE"
node --check "$PROD_BRIDGE" || { echo "❌ check pós-cópia falhou — restaure o backup!"; exit 1; }

echo "♻️  Reiniciando $LABEL…"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 3
echo "✅ Bridge deployado e reiniciado. PID: $(launchctl list | awk -v l="$LABEL" '$3==l{print $1}')"
