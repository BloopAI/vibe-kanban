#!/usr/bin/env bash
set -euo pipefail

CHECK_MODE="${1:-}"

# Create a temporary data directory
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

if [ "$CHECK_MODE" = "--check" ]; then
  echo "➤ Checking SQLx data..."
  cargo sqlx prepare --check
else
  echo "➤ Preparing SQLx data..."
  cargo sqlx prepare
fi

echo "➤ Stopping Postgres..."
pg_ctl -D "$DATA_DIR" -m fast -w stop > /dev/null

echo "➤ Cleaning up..."
rm -rf "$DATA_DIR"

if [ "$CHECK_MODE" = "--check" ]; then
  echo "✅ sqlx check complete using a temporary Postgres instance"
else
  echo "✅ sqlx prepare complete using a temporary Postgres instance"
fi

echo "Killing existing Postgres instance on port $PORT"
pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1