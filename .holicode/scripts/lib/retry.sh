#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Internal sleep with jitter in milliseconds
_retry_sleep() {
  local base_ms=$1
  # jitter 0-250ms
  local jitter=0
  if command -v node >/dev/null 2>&1; then
    jitter=$(node -e "console.log(Math.floor(Math.random()*250))")
  else
    jitter=$(( (RANDOM % 250) ))
  fi
  local total_ms=$(( base_ms + jitter ))
  if command -v node >/dev/null 2>&1; then
    node -e "setTimeout(()=>process.exit(0), ${total_ms});"
  else
    local sleep_sec
    sleep_sec=$(awk "BEGIN {printf \"%.3f\", ${total_ms}/1000 }")
    sleep "$sleep_sec" || true
  fi
}

# retry_with_backoff max_attempts base_delay_ms command...
retry_with_backoff() {
  local max_attempts=$1; shift
  local base_delay_ms=$1; shift
  local attempt=1
  local delay=$base_delay_ms
  local rc=0
  while :; do
    "$@" && return 0 || rc=$?
    if (( attempt >= max_attempts )); then
      return $rc
    fi
    _retry_sleep "$delay"
    # exponential with cap ~10s
    if (( delay < 10000 )); then delay=$(( delay * 2 )); fi
    attempt=$(( attempt + 1 ))
  done
}

# gh_api_retry max_attempts base_delay_ms ARGS...
gh_api_retry() {
  local max_attempts=$1; shift
  local base_delay_ms=$1; shift
  retry_with_backoff "$max_attempts" "$base_delay_ms" gh api "$@"
}
