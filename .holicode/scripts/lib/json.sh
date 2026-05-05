#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
: "${EMITTED_JSON:=0}"

# Minified JSON emitters. One-shot by default to avoid duplicate JSON.
_json_emit_once() {
  if [[ "${EMITTED_JSON:-0}" -eq 0 ]]; then
    echo -n "$1"
    EMITTED_JSON=1
  fi
}

# json_ok action result warnings metrics
# - action: string
# - result: JSON object/string already formatted (default: {})
# - warnings: JSON array (default: [])
# - metrics: JSON object (default: {})
json_ok() {
  local action=${1:-""}
  local result=${2:-"{}"}
  local warnings=${3:-"[]"}
  local metrics=${4:-"{}"}
  _json_emit_once "{\"ok\":true,\"action\":\"${action}\",\"result\":${result},\"warnings\":${warnings},\"metrics\":${metrics}}"
}

# json_err code message details
# - code: string (machine readable)
# - message: string (human readable)
# - details: JSON object (default: {})
json_err() {
  local code=${1:-"UNKNOWN"}
  local message=${2:-"Unknown error"}
  local details=${3:-"{}"}
  _json_emit_once "{\"ok\":false,\"error\":{\"code\":\"${code}\",\"message\":\"${message}\",\"details\":${details}}}"
}
