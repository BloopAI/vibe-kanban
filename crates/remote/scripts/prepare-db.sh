#!/usr/bin/env bash
set -euo pipefail

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

# Connection string
export DATABASE_URL="postgres://localhost:$PORT/postgres"

echo "➤ Running migrations..."
sqlx migrate run

echo "➤ Preparing SQLx data..."
cargo sqlx prepare

echo "➤ Stopping Postgres..."
pg_ctl -D "$DATA_DIR" -m fast -w stop > /dev/null

echo "➤ Cleaning up..."
rm -rf "$DATA_DIR"

echo "✅ sqlx prepare complete using a temporary Postgres instance"

echo "Killing existing Postgres instance on port $PORT"
pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1