#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/.data"
UPLOAD_DIR="$ROOT/uploads"
PORT_VALUE="${PORT:-8080}"

cd "$ROOT"
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

echo "[TradeFlow] Workspace: $ROOT"

# Keep an existing Codespace on the newest main without overwriting local work.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
  if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "[TradeFlow] Checking origin/main..."
    git fetch origin main --quiet || echo "[TradeFlow] Warning: git fetch failed; using current workspace revision."
    if git diff --quiet && git diff --cached --quiet; then
      if git rev-parse --verify origin/main >/dev/null 2>&1; then
        if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
          git merge --ff-only origin/main >/dev/null || true
        elif [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
          echo "[TradeFlow] Workspace and origin/main have diverged; not modifying local commits automatically."
        fi
      fi
    else
      echo "[TradeFlow] Local uncommitted changes detected; skipping automatic main update."
    fi
  else
    echo "[TradeFlow] Current branch is '${CURRENT_BRANCH:-detached}', so automatic main update is skipped."
  fi
fi

echo "[TradeFlow] Revision: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

if [ ! -f "$DATA_DIR/app.secret" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 > "$DATA_DIR/app.secret"
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > "$DATA_DIR/app.secret"
  fi
  chmod 600 "$DATA_DIR/app.secret"
fi

echo "[TradeFlow] Installing/updating backend dependencies..."
npm --prefix "$ROOT/apps/api" install

echo "[TradeFlow] Installing/updating frontend dependencies..."
npm --prefix "$ROOT/apps/web" install

echo "[TradeFlow] Building latest Vue frontend..."
npm --prefix "$ROOT/apps/web" run build

if [ -f "$DATA_DIR/tradeflow.pid" ]; then
  OLD_PID="$(cat "$DATA_DIR/tradeflow.pid" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[TradeFlow] Stopping previous process $OLD_PID..."
    kill "$OLD_PID" || true
    for _ in {1..10}; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.3
    done
  fi
fi

# Avoid an orphaned previous server holding 8080.
if command -v lsof >/dev/null 2>&1; then
  LISTEN_PID="$(lsof -tiTCP:"$PORT_VALUE" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [ -n "$LISTEN_PID" ]; then
    echo "[TradeFlow] Port $PORT_VALUE is occupied by PID $LISTEN_PID; stopping it before restart."
    kill "$LISTEN_PID" 2>/dev/null || true
    sleep 1
  fi
fi

APP_SECRET_VALUE="$(cat "$DATA_DIR/app.secret")"

echo "[TradeFlow] Starting full-stack server on 0.0.0.0:$PORT_VALUE..."
nohup env   NODE_ENV=development   HOST=0.0.0.0   PORT="$PORT_VALUE"   DB_FILE="$DATA_DIR/tradeflow.db"   WEB_DIST="$ROOT/apps/web/dist"   UPLOAD_DIR="$UPLOAD_DIR"   BACKUP_DIR="$DATA_DIR/backups"   APP_SECRET="$APP_SECRET_VALUE"   CORS_ORIGIN="*"   node "$ROOT/apps/api/server.mjs"   > "$DATA_DIR/tradeflow.log" 2>&1 &

PID=$!
echo "$PID" > "$DATA_DIR/tradeflow.pid"

for i in {1..45}; do
  HEALTH_OK=0
  READY_OK=0
  curl -fsS "http://127.0.0.1:$PORT_VALUE/api/health" >/dev/null 2>&1 && HEALTH_OK=1 || true
  curl -fsS "http://127.0.0.1:$PORT_VALUE/api/ready" >/dev/null 2>&1 && READY_OK=1 || true
  if [ "$HEALTH_OK" = "1" ] && [ "$READY_OK" = "1" ]; then
    echo "[TradeFlow] READY"
    echo "[TradeFlow] URL: http://127.0.0.1:$PORT_VALUE"
    echo "[TradeFlow] Health: http://127.0.0.1:$PORT_VALUE/api/health"
    echo "[TradeFlow] Ready:  http://127.0.0.1:$PORT_VALUE/api/ready"
    echo "[TradeFlow] PID: $PID"
    echo "[TradeFlow] Database: $DATA_DIR/tradeflow.db"
    echo "[TradeFlow] Uploads: $UPLOAD_DIR"
    echo "[TradeFlow] Log: $DATA_DIR/tradeflow.log"
    exit 0
  fi
  sleep 1
done

echo "[TradeFlow] Server failed to become ready within 45 seconds."
echo "---------------- tradeflow.log ----------------"
cat "$DATA_DIR/tradeflow.log" || true
exit 1
