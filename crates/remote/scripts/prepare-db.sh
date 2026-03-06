#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
BILLING_MANIFEST_PATH=""
CHECK_MODE=""

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_MODE="--check" ;;
    *) BILLING_MANIFEST_PATH="$arg" ;;
  esac
done

# Convert relative paths to absolute (relative to repo root, since pnpm runs from there)
BILLING_DIR=""
if [ -n "$BILLING_MANIFEST_PATH" ]; then
  if [[ "$BILLING_MANIFEST_PATH" != /* ]]; then
    REPO_ROOT="$(cd "$REMOTE_DIR/../.." && pwd)"
    BILLING_MANIFEST_PATH="$REPO_ROOT/$BILLING_MANIFEST_PATH"
  fi

  if [ -f "$BILLING_MANIFEST_PATH" ]; then
    BILLING_DIR="$(cd "$(dirname "$BILLING_MANIFEST_PATH")" && pwd)"
  else
    echo "⚠️  Billing manifest not found: $BILLING_MANIFEST_PATH (skipping billing)" >&2
  fi
fi

# For --check mode, run offline without database (just verify .sqlx cache)
if [ "$CHECK_MODE" = "--check" ]; then
  if [ -n "$BILLING_DIR" ]; then
    echo "➤ Checking SQLx data for billing (offline mode)..."
    (cd "$BILLING_DIR" && SQLX_OFFLINE=true cargo sqlx prepare --check)
  fi
  echo "➤ Checking SQLx data for remote (offline mode)..."
  SQLX_OFFLINE=true cargo sqlx prepare --check

  RELAY_TUNNEL_DIR="$(cd "$REMOTE_DIR/../../crates/relay-tunnel" && pwd)"
  echo "➤ Checking SQLx data for relay-tunnel (offline mode)..."
  (cd "$RELAY_TUNNEL_DIR" && SQLX_OFFLINE=true cargo sqlx prepare --check -- --features server)

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

if [ -n "$BILLING_DIR" ]; then
  echo "➤ Preparing SQLx data for billing..."
  (cd "$BILLING_DIR" && cargo sqlx prepare)
fi

echo "➤ Preparing SQLx data for remote..."
cargo sqlx prepare

RELAY_TUNNEL_DIR="$(cd "$REMOTE_DIR/../../crates/relay-tunnel" && pwd)"
echo "➤ Preparing SQLx data for relay-tunnel..."
(cd "$RELAY_TUNNEL_DIR" && cargo sqlx prepare -- --features server)

echo "➤ Stopping Postgres..."
pg_ctl -D "$DATA_DIR" -m fast -w stop > /dev/null

echo "➤ Cleaning up..."
rm -rf "$DATA_DIR"

echo "Killing existing Postgres instance on port $PORT"
pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1

echo "✅ sqlx prepare complete"
