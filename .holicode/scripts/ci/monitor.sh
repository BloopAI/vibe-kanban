#!/usr/bin/env bash
# Monitor PR CI status and emit strict JSON summary (passed/failed/pending + checks array)
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd jq
ACTION="ci.monitor"

PR_NUMBER=""
TIMEOUT="${TIMEOUT:-30m}"

# Args: --pr N --timeout 30m
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_NUMBER="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if ! gh_guard; then
  code=$?
  case "$code" in
    2) json_err "GH_CLI_MISSING" "GitHub CLI (gh) not found" "{}";;
    3) json_err "GH_AUTH_MISSING" "GitHub CLI not authenticated" "{}";;
    *) json_err "GH_NOT_READY" "GitHub CLI not ready" "{\"code\":$code}";;
  esac
  exit 1
fi

if [[ -z "$PR_NUMBER" ]]; then PR_NUMBER=$(detect_current_pr_number || true); fi
if [[ -z "$PR_NUMBER" ]]; then json_err "NO_PR" "No PR detected for current branch" "{}"; exit 1; fi

# Watch checks (portable timeout)
checks_watch_with_timeout "$PR_NUMBER" "$TIMEOUT" || true

# Fetch checks and summarize
ci_json=$(get_pr_checks_json "$PR_NUMBER" 2>/dev/null || echo "[]")
summary=$(summarize_checks_json "$ci_json" 2>/dev/null || echo '{"passed":0,"failed":0,"pending":0,"checks":[]}')

json_ok "$ACTION" "$summary" "[]" "{}"
