#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/.data"
UPLOAD_DIR="$ROOT/uploads"
PORT_VALUE="${PORT:-8080}"

mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

if [ ! -f "$DATA_DIR/app.secret" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 > "$DATA_DIR/app.secret"
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > "$DATA_DIR/app.secret"
  fi
  chmod 600 "$DATA_DIR/app.secret"
fi

if [ ! -d "$ROOT/apps/web/node_modules" ]; then
  npm --prefix "$ROOT/apps/web" install
fi

if [ ! -f "$ROOT/apps/web/dist/index.html" ]; then
  npm --prefix "$ROOT/apps/web" run build
fi

if [ -f "$DATA_DIR/tradeflow.pid" ]; then
  OLD_PID="$(cat "$DATA_DIR/tradeflow.pid" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" || true
    sleep 1
  fi
fi

APP_SECRET_VALUE="$(cat "$DATA_DIR/app.secret")"

nohup env \
  HOST=0.0.0.0 \
  PORT="$PORT_VALUE" \
  DB_FILE="$DATA_DIR/tradeflow.db" \
  WEB_DIST="$ROOT/apps/web/dist" \
  UPLOAD_DIR="$UPLOAD_DIR" \
  APP_SECRET="$APP_SECRET_VALUE" \
  CORS_ORIGIN="*" \
  node "$ROOT/apps/api/server.mjs" \
  > "$DATA_DIR/tradeflow.log" 2>&1 &

PID=$!
echo "$PID" > "$DATA_DIR/tradeflow.pid"

for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:$PORT_VALUE/api/health" >/dev/null 2>&1; then
    echo "TradeFlow CRM is running on port $PORT_VALUE"
    echo "Log: $DATA_DIR/tradeflow.log"
    exit 0
  fi
  sleep 1
done

echo "TradeFlow CRM failed to become healthy."
cat "$DATA_DIR/tradeflow.log" || true
exit 1
