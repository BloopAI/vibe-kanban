#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SNAPSHOT_DIR="${FORGE_SNAPSHOT_DIR:-$ROOT_DIR/dev_assets_seed/forge-snapshot}"
SNAPSHOT_DB="${FORGE_SNAPSHOT_DB:-$SNAPSHOT_DIR/forge.sqlite}"

OUT_DIR="docs/regression/latest"
BASELINE_DIR="docs/regression/baseline"
LOG_DIR="docs/regression/logs"
mkdir -p "$OUT_DIR" "$LOG_DIR"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_LOG="$LOG_DIR/run-$TIMESTAMP.log"

exec > >(tee "$RUN_LOG") 2>&1

echo "# Forge Regression Harness"
echo "Timestamp: $TIMESTAMP"

for tool in jq curl pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: Required tool '$tool' is not available in PATH"
    exit 1
  fi
done

if [[ ! -f "$SNAPSHOT_DB" ]]; then
  echo "ERROR: Snapshot database not found at $SNAPSHOT_DB"
  echo "Provide FORGE_SNAPSHOT_DB or populate dev_assets_seed/forge-snapshot/forge.sqlite"
  exit 1
fi

export DATABASE_URL="${DATABASE_URL:-sqlite://$SNAPSHOT_DB}"
export FORGE_APP_ADDR="${FORGE_APP_ADDR:-127.0.0.1:8887}"
export RUST_LOG="${RUST_LOG:-info}"
BRANCH_TEMPLATE_TASK_ID="${FORGE_SAMPLE_TASK_ID:-1}"

echo "Database: $DATABASE_URL"
echo "Forge app address: $FORGE_APP_ADDR"
echo "Sample task id: $BRANCH_TEMPLATE_TASK_ID"

echo "Running cargo tests..."
cargo test --workspace --quiet

echo "Running lint/build checks..."
pnpm run lint
pnpm run build
pnpm run build:npx

echo "Packing npx CLI (output captured in docs/regression/)"
pnpm pack --filter npx-cli --pack-destination "$LOG_DIR"

echo "Starting forge-app for regression checks..."
APP_LOG="$LOG_DIR/forge-app-$TIMESTAMP.log"
FORGE_ENV=(DATABASE_URL="$DATABASE_URL" FORGE_APP_ADDR="$FORGE_APP_ADDR")
env DATABASE_URL="$DATABASE_URL" FORGE_APP_ADDR="$FORGE_APP_ADDR" cargo run --quiet -p forge-app >"$APP_LOG" 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" || true
    wait "$APP_PID" || true
  fi
}
trap cleanup EXIT

echo "Waiting for forge-app to become ready..."
ATTEMPTS=0
until curl --fail --silent "http://$FORGE_APP_ADDR/health" > /dev/null; do
  sleep 1
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -gt 30 ]]; then
    echo "ERROR: forge-app did not become ready within 30 seconds"
    exit 1
  fi
done

declare -A ENDPOINTS=(
  [health]="/health"
  [omni_instances]="/api/forge/omni/instances"
  [branch_templates]="/api/forge/branch-templates/${BRANCH_TEMPLATE_TASK_ID}"
  [genie_wishes]="/api/forge/genie/wishes"
)

echo "Collecting API samples..."
for name in "${!ENDPOINTS[@]}"; do
  url="http://$FORGE_APP_ADDR${ENDPOINTS[$name]}"
  target="$OUT_DIR/$name.json"
  echo "  -> $url"
  if ! curl --fail --silent "$url" | jq --sort-keys '.' > "$target"; then
    echo "ERROR: Failed to collect $url"
    exit 1
  fi
done

echo "Running CLI smoke tests..."
node npx-cli/bin/cli.js --help > "$OUT_DIR/cli-help.txt"
node npx-cli/bin/cli.js --version > "$OUT_DIR/cli-version.txt"

if [[ -d "$BASELINE_DIR" ]]; then
  echo "Comparing against baseline in $BASELINE_DIR"
  DIFF_FAIL=0
  for file in "$OUT_DIR"/*; do
    base="$BASELINE_DIR/$(basename "$file")"
    if [[ -f "$base" ]]; then
      if ! diff -u "$base" "$file"; then
        echo "WARNING: Differences detected for $(basename "$file")"
        DIFF_FAIL=1
      fi
    else
      echo "WARNING: Baseline missing for $(basename "$file")"
    fi
  done
  if [[ $DIFF_FAIL -eq 1 ]]; then
    echo "Regression differences detected. Review warnings above."
    exit 1
  fi
else
  echo "Baseline directory $BASELINE_DIR not found. Copying current results as baseline."
  mkdir -p "$BASELINE_DIR"
  cp "$OUT_DIR"/* "$BASELINE_DIR"/
fi

echo "Regression harness completed successfully. Logs: $RUN_LOG"
