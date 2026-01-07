#!/usr/bin/env bash
set -euo pipefail

CHECK_MODE="${1:-}"

# For --check mode, run offline without database (just verify .sqlx cache)
if [ "$CHECK_MODE" = "--check" ]; then
  echo "➤ Checking SQLx data (offline mode)..."
  SQLX_OFFLINE=true cargo sqlx prepare --check
  echo "✅ sqlx check complete"
  exit 0
fi

# For prepare mode, need a running PostgreSQL instance
DATA_DIR="$(mktemp -d /tmp/sqlxpg.XXXXXX)"
PORT=54329

echo "Killing existing Postgres instance on port $PORT"
pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1

echo "➤ Initializing temporary Postgres cluster..."
initdb -D "$DATA_DIR" > /dev/null

echo "➤ Starting Postgres on port $PORT..."
pg_ctl -D "$DATA_DIR" -o "-p $PORT" -w start > /dev/null

echo "➤ Creating 'remote' database..."
createdb -p $PORT remote

# Connection string
export DATABASE_URL="postgres://localhost:$PORT/remote"

echo "➤ Running migrations..."
sqlx migrate run

echo "➤ Preparing SQLx data..."
cargo sqlx prepare

echo "➤ Stopping Postgres..."
pg_ctl -D "$DATA_DIR" -m fast -w stop > /dev/null

echo "➤ Cleaning up..."
rm -rf "$DATA_DIR"

echo "Killing existing Postgres instance on port $PORT"
pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1

echo "✅ sqlx prepare complete"