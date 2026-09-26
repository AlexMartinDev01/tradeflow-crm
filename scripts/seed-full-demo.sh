#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_FILE_VALUE="${DB_FILE:-$ROOT/.data/tradeflow.db}"
if [ ! -f "$DB_FILE_VALUE" ]; then
  echo "[Seed] Database does not exist: $DB_FILE_VALUE"
  echo "[Seed] Start TradeFlow first: bash scripts/codespaces-start.sh"
  exit 1
fi

echo "[Seed] Initializing full realistic demo dataset..."
echo "[Seed] DB: $DB_FILE_VALUE"
DB_FILE="$DB_FILE_VALUE" node "$ROOT/scripts/seed-full-demo.mjs"
