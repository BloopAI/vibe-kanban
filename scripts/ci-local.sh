#!/usr/bin/env bash
# Run CI checks locally, mirroring .github/workflows/test.yml
#
# Usage: ./scripts/ci-local.sh [group/job...]
#
# Groups (mirror CI change-detection areas):
#   frontend        lint, format, build for all frontend packages + i18n
#   backend         schema checks + clippy/fmt + tests (all backend CI jobs)
#   backend-remote  remote crates fmt, clippy, types, sqlx
#
# Individual jobs (fine-grained):
#   backend-schema   generated types + sqlx
#   backend-clippy   cargo fmt + clippy
#   backend-test     cargo nextest / cargo test
#   tauri            tauri-app fmt + clippy + check
#
# If no arguments are given, changed files are detected via git diff against
# main and only the relevant groups are run. Falls back to all 3 groups if
# the diff cannot be determined.
#
# Examples:
#   ./scripts/ci-local.sh                       # auto-detect from git diff
#   ./scripts/ci-local.sh backend               # all backend checks
#   ./scripts/ci-local.sh frontend backend      # frontend + backend
#   ./scripts/ci-local.sh backend-clippy        # just clippy

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
# Individual job implementations
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

job_backend_schema() {
  local failed=0
  log_job "backend-schema-checks" "generated types + sqlx"
  run_step "Check generated TS types" npm run generate-types:check || failed=1
  run_step "SQLx offline check"       npm run prepare-db:check      || failed=1
  return $failed
}

job_backend_clippy() {
  local failed=0
  log_job "backend-clippy" "cargo fmt + clippy (excludes tauri)"
  run_step "cargo fmt check" cargo fmt --all -- --check                                                        || failed=1
  run_step "cargo clippy"    cargo clippy --workspace --all-targets --exclude vibe-kanban-tauri -- -D warnings || failed=1
  return $failed
}

job_backend_test() {
  log_job "backend-test" "cargo nextest (or cargo test)"
  if cargo nextest --version &>/dev/null 2>&1; then
    run_step "cargo nextest run" cargo nextest run --workspace --exclude vibe-kanban-tauri
  else
    echo -e "${YELLOW}  ! cargo-nextest not found, falling back to cargo test${RESET}"
    run_step "cargo test" cargo test --workspace --exclude vibe-kanban-tauri
  fi
}

job_backend_remote() {
  local failed=0
  log_job "backend-remote-checks" "remote crates fmt, clippy, types, sqlx"
  echo -e "${YELLOW}  ! Note: requires SSH access to private deps (VK_PRIVATE_DEPLOY_KEY)${RESET}"
  run_step "Check remote Cargo.lock (remote)"       bash -c 'cargo metadata --locked --format-version 1 --manifest-path crates/remote/Cargo.toml > /dev/null'        || failed=1
  run_step "Check remote Cargo.lock (relay-tunnel)" bash -c 'cargo metadata --locked --format-version 1 --manifest-path crates/relay-tunnel/Cargo.toml > /dev/null'   || failed=1
  run_step "cargo fmt check (remote)"       cargo fmt --all --manifest-path crates/remote/Cargo.toml -- --check                                                        || failed=1
  run_step "cargo fmt check (relay-tunnel)" cargo fmt --all --manifest-path crates/relay-tunnel/Cargo.toml -- --check                                                  || failed=1
  run_step "cargo clippy (remote)"       cargo clippy --all-targets --manifest-path crates/remote/Cargo.toml -- -D warnings                                            || failed=1
  run_step "cargo clippy (relay-tunnel)" cargo clippy --all-targets --manifest-path crates/relay-tunnel/Cargo.toml -- -D warnings                                      || failed=1
  run_step "Check remote generated TS types" npm run remote:generate-types:check || failed=1
  run_step "Remote SQLx offline check"       npm run remote:prepare-db:check      || failed=1
  return $failed
}

job_tauri() {
  local failed=0
  log_job "tauri-checks" "tauri fmt + clippy + check"
  if [[ "$(uname)" != "Linux" ]]; then
    echo -e "${YELLOW}  ! Tauri Linux deps (libwebkit2gtk etc.) only available on Linux — skipping apt-get${RESET}"
  fi
  run_step "cargo fmt check (tauri)" cargo fmt --all --manifest-path crates/tauri-app/Cargo.toml -- --check       || failed=1
  run_step "cargo clippy (tauri)"    cargo clippy --all-targets --manifest-path crates/tauri-app/Cargo.toml -- -D warnings || failed=1
  run_step "cargo check (tauri)"     cargo check -p vibe-kanban-tauri                                              || failed=1
  return $failed
}

# ---------------------------------------------------------------------------
# Groups: expand to constituent jobs, deduplicating
# ---------------------------------------------------------------------------

# Track which atomic jobs have been queued (bash 3 compatible)
QUEUED_JOBS=()

enqueue_job() {
  local job="$1" j
  for j in "${QUEUED_JOBS[@]:-}"; do
    [[ "$j" == "$job" ]] && return
  done
  QUEUED_JOBS+=("$job")
  ATOMIC_JOBS+=("$job")
}

expand_group() {
  local name="$1"
  case "$name" in
    frontend)
      enqueue_job "frontend" ;;
    backend)
      enqueue_job "backend-schema"
      enqueue_job "backend-clippy"
      enqueue_job "backend-test" ;;
    backend-remote)
      enqueue_job "backend-remote" ;;
    # Pass-through for individual atomic jobs
    backend-schema|backend-clippy|backend-test|tauri)
      enqueue_job "$name" ;;
    *)
      echo -e "${RED}Unknown job/group: $name${RESET}"
      echo "Groups:        frontend, backend, backend-remote"
      echo "Individual:    backend-schema, backend-clippy, backend-test, tauri"
      exit 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Auto-detect changed areas from git diff vs main
# ---------------------------------------------------------------------------

file_touches_frontend() {
  local f="$1"
  [[ "$f" == packages/local-web/* ]] ||
  [[ "$f" == packages/web-core/* ]] ||
  [[ "$f" == packages/remote-web/* ]] ||
  [[ "$f" == packages/ui/* ]] ||
  [[ "$f" == shared/* ]] ||
  [[ "$f" == scripts/check-i18n.sh ]] ||
  [[ "$f" == scripts/check-unused-i18n-keys.mjs ]] ||
  [[ "$f" == scripts/check-legacy-frontend-paths.sh ]] ||
  [[ "$f" == scripts/legacy-frontend-paths-allowlist.txt ]] ||
  [[ "$f" == pnpm-lock.yaml ]] ||
  [[ "$f" == pnpm-workspace.yaml ]] ||
  [[ "$f" == package.json ]] ||
  [[ "$f" == .npmrc ]]
}

file_touches_backend() {
  local f="$1"
  # backend-remote crates are excluded from the main backend group
  [[ "$f" == crates/remote/* ]] && return 1
  [[ "$f" == crates/relay-tunnel/* ]] && return 1
  [[ "$f" == crates/* ]] ||
  [[ "$f" == Cargo.toml ]] ||
  [[ "$f" == Cargo.lock ]] ||
  [[ "$f" == shared/* ]] ||
  [[ "$f" == scripts/prepare-db.js ]] ||
  [[ "$f" == pnpm-lock.yaml ]] ||
  [[ "$f" == package.json ]] ||
  [[ "$f" == rustfmt.toml ]] ||
  [[ "$f" == rust-toolchain.toml ]] ||
  [[ "$f" == .cargo/* ]]
}

file_touches_backend_remote() {
  local f="$1"
  [[ "$f" == crates/remote/* ]] ||
  [[ "$f" == crates/relay-tunnel/* ]] ||
  [[ "$f" == crates/relay-tunnel-core/* ]] ||
  [[ "$f" == crates/ws-bridge/* ]] ||
  [[ "$f" == crates/api-types/* ]] ||
  [[ "$f" == crates/relay-types/* ]] ||
  [[ "$f" == crates/utils/* ]] ||
  [[ "$f" == Cargo.toml ]] ||
  [[ "$f" == Cargo.lock ]] ||
  [[ "$f" == shared/* ]] ||
  [[ "$f" == rustfmt.toml ]] ||
  [[ "$f" == rust-toolchain.toml ]] ||
  [[ "$f" == .cargo/* ]] ||
  [[ "$f" == pnpm-lock.yaml ]] ||
  [[ "$f" == package.json ]]
}

detect_groups() {
  local base
  base=$(git merge-base HEAD main 2>/dev/null) || { echo "all"; return; }
  local changed
  changed=$(git diff --name-only "$base"...HEAD 2>/dev/null) || { echo "all"; return; }

  if [[ -z "$changed" ]]; then
    # No changes vs main — run everything so the user gets a clean bill of health
    echo "all"
    return
  fi

  local groups=()
  local hit_fe=0 hit_be=0 hit_remote=0

  while IFS= read -r file; do
    [[ $hit_fe -eq 0 ]] && file_touches_frontend "$file" && hit_fe=1 && groups+=("frontend")
    [[ $hit_be -eq 0 ]] && file_touches_backend "$file" && hit_be=1 && groups+=("backend")
    [[ $hit_remote -eq 0 ]] && file_touches_backend_remote "$file" && hit_remote=1 && groups+=("backend-remote")
    [[ $hit_fe -eq 1 && $hit_be -eq 1 && $hit_remote -eq 1 ]] && break
  done <<< "$changed"

  if [[ ${#groups[@]} -eq 0 ]]; then
    echo "none"
  else
    echo "${groups[@]}"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

ATOMIC_JOBS=()

if [[ $# -eq 0 ]]; then
  echo -e "${BOLD}No jobs specified — detecting changed areas from git diff vs main...${RESET}"
  read -ra detected <<< "$(detect_groups)"

  if [[ "${detected[0]}" == "all" ]]; then
    echo -e "${YELLOW}  Could not determine changed files, running all groups: frontend backend backend-remote${RESET}"
    detected=(frontend backend backend-remote)
  elif [[ "${detected[0]}" == "none" ]]; then
    echo -e "${GREEN}  No relevant files changed. Nothing to run.${RESET}"
    exit 0
  else
    echo -e "  Detected: ${BOLD}${detected[*]}${RESET}"
  fi

  for g in "${detected[@]}"; do expand_group "$g"; done
else
  for arg in "$@"; do expand_group "$arg"; done
fi

echo -e "${BOLD}Running: ${ATOMIC_JOBS[*]}${RESET}"

for job in "${ATOMIC_JOBS[@]}"; do
  case "$job" in
    frontend)       if job_frontend;       then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
    backend-schema) if job_backend_schema; then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
    backend-clippy) if job_backend_clippy; then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
    backend-test)   if job_backend_test;   then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
    backend-remote) if job_backend_remote; then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
    tauri)          if job_tauri;          then PASSED+=("$job"); else FAILED+=("$job"); fi ;;
  esac
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
