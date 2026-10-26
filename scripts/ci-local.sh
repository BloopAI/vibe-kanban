#!/usr/bin/env bash
# Run CI checks locally, mirroring .github/workflows/test.yml
# Usage: ./scripts/ci-local.sh [job...]
#   Jobs: frontend, backend-schema, backend-clippy, backend-test, backend-remote, tauri
#   If no jobs specified, runs: frontend, backend-schema, backend-clippy, backend-test
#
# Examples:
#   ./scripts/ci-local.sh                          # run default jobs
#   ./scripts/ci-local.sh backend-clippy           # run one job
#   ./scripts/ci-local.sh frontend backend-test    # run two jobs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

PASSED=()
FAILED=()

log_job() { echo -e "\n${BLUE}${BOLD}==> [$1]${RESET} $2"; }
log_ok()  { echo -e "${GREEN}${BOLD}  ✓ $1${RESET}"; }
log_err() { echo -e "${RED}${BOLD}  ✗ $1${RESET}"; }

run_step() {
  local desc="$1"; shift
  echo -e "${YELLOW}  » $desc${RESET}"
  if "$@"; then
    log_ok "$desc"
  else
    log_err "$desc"
    return 1
  fi
}

# ---------------------------------------------------------------------------
job_frontend() {
  log_job "frontend-checks" "lint, format, build, i18n"
  NODE_OPTIONS=--max-old-space-size=8192 \
  npx concurrently \
    --kill-others-on-fail \
    --names "local:lint,local:fmt,local:build,remote:fmt,remote:build,ui:check,ui:lint,ui:fmt,core:check,core:fmt,i18n,i18n:unused,legacy" \
    --timings \
    "cd packages/local-web && npm run lint" \
    "cd packages/local-web && npm run format:check" \
    "cd packages/local-web && npm run build" \
    "cd packages/remote-web && npm run format:check" \
    "cd packages/remote-web && npm run build" \
    "cd packages/ui && npm run check" \
    "cd packages/ui && npm run lint" \
    "cd packages/ui && npm run format:check" \
    "cd packages/web-core && npm run check" \
    "cd packages/web-core && npm run format:check" \
    "GITHUB_BASE_REF=main ./scripts/check-i18n.sh" \
    "node scripts/check-unused-i18n-keys.mjs" \
    "./scripts/check-legacy-frontend-paths.sh"
}

# ---------------------------------------------------------------------------
job_backend_schema() {
  log_job "backend-schema-checks" "generated types + sqlx"
  run_step "Check generated TS types" npm run generate-types:check
  run_step "SQLx offline check"       npm run prepare-db:check
}

# ---------------------------------------------------------------------------
job_backend_clippy() {
  log_job "backend-clippy" "cargo fmt + clippy (excludes tauri)"
  # Run fmt check and clippy in parallel like CI does
  run_step "cargo fmt check" cargo fmt --all -- --check
  run_step "cargo clippy"    cargo clippy --workspace --all-targets --exclude vibe-kanban-tauri -- -D warnings
}

# ---------------------------------------------------------------------------
job_backend_test() {
  log_job "backend-test" "cargo nextest (or cargo test)"
  if command -v cargo-nextest &>/dev/null || cargo nextest --version &>/dev/null 2>&1; then
    run_step "cargo nextest run" cargo nextest run --workspace --exclude vibe-kanban-tauri
  else
    echo -e "${YELLOW}  ! cargo-nextest not found, falling back to cargo test${RESET}"
    run_step "cargo test" cargo test --workspace --exclude vibe-kanban-tauri
  fi
}

# ---------------------------------------------------------------------------
job_backend_remote() {
  log_job "backend-remote-checks" "remote crates fmt, clippy, types, sqlx"
  echo -e "${YELLOW}  ! Note: requires SSH access to private deps (VK_PRIVATE_DEPLOY_KEY)${RESET}"
  run_step "Check remote Cargo.lock (remote)"       bash -c 'cargo metadata --locked --format-version 1 --manifest-path crates/remote/Cargo.toml > /dev/null'
  run_step "Check remote Cargo.lock (relay-tunnel)" bash -c 'cargo metadata --locked --format-version 1 --manifest-path crates/relay-tunnel/Cargo.toml > /dev/null'
  run_step "cargo fmt check (remote)"       cargo fmt --all --manifest-path crates/remote/Cargo.toml -- --check
  run_step "cargo fmt check (relay-tunnel)" cargo fmt --all --manifest-path crates/relay-tunnel/Cargo.toml -- --check
  run_step "cargo clippy (remote)"       cargo clippy --all-targets --manifest-path crates/remote/Cargo.toml -- -D warnings
  run_step "cargo clippy (relay-tunnel)" cargo clippy --all-targets --manifest-path crates/relay-tunnel/Cargo.toml -- -D warnings
  run_step "Check remote generated TS types" npm run remote:generate-types:check
  run_step "Remote SQLx offline check"       npm run remote:prepare-db:check
}

# ---------------------------------------------------------------------------
job_tauri() {
  log_job "tauri-checks" "tauri fmt + clippy + check"
  if [[ "$(uname)" != "Linux" ]]; then
    echo -e "${YELLOW}  ! Tauri Linux deps (libwebkit2gtk etc.) only available on Linux — skipping apt-get${RESET}"
  fi
  run_step "cargo fmt check (tauri)" cargo fmt --all --manifest-path crates/tauri-app/Cargo.toml -- --check
  run_step "cargo clippy (tauri)"    cargo clippy --all-targets --manifest-path crates/tauri-app/Cargo.toml -- -D warnings
  run_step "cargo check (tauri)"     cargo check -p vibe-kanban-tauri
}

# ---------------------------------------------------------------------------
run_job() {
  local name="$1"
  case "$name" in
    frontend)        job_frontend       ;;
    backend-schema)  job_backend_schema ;;
    backend-clippy)  job_backend_clippy ;;
    backend-test)    job_backend_test   ;;
    backend-remote)  job_backend_remote ;;
    tauri)           job_tauri          ;;
    *)
      echo -e "${RED}Unknown job: $name${RESET}"
      echo "Valid jobs: frontend, backend-schema, backend-clippy, backend-test, backend-remote, tauri"
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
DEFAULT_JOBS=(frontend backend-schema backend-clippy backend-test)

if [[ $# -eq 0 ]]; then
  JOBS=("${DEFAULT_JOBS[@]}")
else
  JOBS=("$@")
fi

echo -e "${BOLD}Running CI jobs locally: ${JOBS[*]}${RESET}"

for job in "${JOBS[@]}"; do
  if run_job "$job"; then
    PASSED+=("$job")
  else
    FAILED+=("$job")
  fi
done

# ---------------------------------------------------------------------------
echo -e "\n${BOLD}=== Results ===${RESET}"
for j in "${PASSED[@]:-}"; do [[ -n "$j" ]] && echo -e "  ${GREEN}✓ $j${RESET}"; done
for j in "${FAILED[@]:-}"; do [[ -n "$j" ]] && echo -e "  ${RED}✗ $j${RESET}"; done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}CI failed (${#FAILED[@]} job(s))${RESET}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}All CI jobs passed!${RESET}"
fi
