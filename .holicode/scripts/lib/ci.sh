#!/usr/bin/env bash
# CI helpers built on top of gh; portable timeouts
set -Eeuo pipefail
IFS=$'\n\t'

# Requires compat.sh and github.sh to be sourced by common.sh

# Watch PR checks with a timeout (e.g., 30m, 10m, 45s)
checks_watch_with_timeout() {
  local pr=$1
  local timeout=${2:-"30m"}
  if ! command -v gh >/dev/null 2>&1; then
    return 1
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$timeout" gh pr checks "$pr" --watch || true
  elif command -v timeout >/dev/null 2>&1; then
    timeout "$timeout" gh pr checks "$pr" --watch || true
  else
    # naive fallback: poll every 10s up to timeout
    local s=${timeout}
    s="${s//h/*3600}"; s="${s//m/*60}"; s="${s//s/}"
    local secs=60
    if command -v node >/dev/null 2>&1; then
      secs=$(node -e "console.log(Math.floor((${s})))")
    else
      # shellcheck disable=SC2001
      secs=$(echo "$s" | sed 's/*/ /g'); secs=$((secs))
    fi
    local waited=0
    while (( waited < secs )); do
      gh pr checks "$pr" >/dev/null 2>&1 || true
      sleep 10
      waited=$(( waited + 10 ))
    done
  fi
}

# Summarize checks JSON: returns passed, failed, pending counts as a JSON object
summarize_checks_json() {
  local json=$1
  if command -v jq >/dev/null 2>&1; then
    jq -n --argjson checks "$json" \
      '{
        passed: ($checks | map(select(.conclusion=="success")) | length),
        failed: ($checks | map(select(.conclusion=="failure")) | length),
        pending: ($checks | map(select(.status=="in_progress" or .status=="queued")) | length),
        checks: $checks
      }'
  else
    # Minimal fallback: cannot parse; return empty
    echo '{"passed":0,"failed":0,"pending":0,"checks":[]}'
  fi
}
