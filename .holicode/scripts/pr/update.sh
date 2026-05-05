#!/usr/bin/env bash
# Update PR metadata: labels/reviewers/comments/status/link-issues; strict JSON output
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd jq
ACTION="pr.update"

usage() {
  cat <<'USG'
Usage:
  scripts/pr/update.sh --action status [--pr N]
  scripts/pr/update.sh --action labels --op add|remove|set --labels "a,b" [--pr N]
  scripts/pr/update.sh --action reviewers --op add|remove --reviewers "user1,user2" [--pr N]
  scripts/pr/update.sh --action comment --text "message" [--pr N]
  scripts/pr/update.sh --action link-issues --link-type closes|fixes|related --issues "1,2" [--pr N]
USG
}

PR_NUMBER=""
ACTION_ARG=""
OP=""
LABELS=""
REVIEWERS=""
TEXT=""
ISSUES=""
LINK_TYPE="related"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_NUMBER="$2"; shift 2 ;;
    --action) ACTION_ARG="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --labels) LABELS="$2"; shift 2 ;;
    --reviewers) REVIEWERS="$2"; shift 2 ;;
    --text) TEXT="$2"; shift 2 ;;
    --issues) ISSUES="$2"; shift 2 ;;
    --link-type) LINK_TYPE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) shift ;;
  esac
done

if [[ -z "$ACTION_ARG" ]]; then
  json_err "BAD_REQUEST" "Missing --action" "{}"; exit 1
fi

# gh guard and PR detection
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

case "$ACTION_ARG" in
  status)
    pr_status=$(gh pr view "$PR_NUMBER" --json number,state,mergeStateStatus,reviews,statusCheckRollup,url 2>/dev/null || echo "{}")
    json_ok "$ACTION" "$pr_status" "[]" "{}"
    ;;
  labels)
    case "$OP" in
      add) pr_labels_edit "$PR_NUMBER" add "$LABELS" ;;
      remove) pr_labels_edit "$PR_NUMBER" remove "$LABELS" ;;
      set) pr_labels_set "$PR_NUMBER" "$LABELS" ;;
      *) json_err "BAD_OP" "Invalid labels op (add|remove|set)" "{}"; exit 1 ;;
    esac
    json_ok "$ACTION" "{\"pr\":${PR_NUMBER},\"labels\":\"${LABELS}\",\"op\":\"${OP}\"}" "[]" "{}"
    ;;
  reviewers)
    case "$OP" in
      add|remove)
        if [[ -z "$REVIEWERS" ]]; then json_err "MISSING_REVIEWERS" "Provide --reviewers" "{}"; exit 1; fi
        pr_reviewers_edit "$PR_NUMBER" "$OP" "$REVIEWERS"
        ;;
      *) json_err "BAD_OP" "Invalid reviewers op (add|remove)" "{}"; exit 1 ;;
    esac
    json_ok "$ACTION" "{\"pr\":${PR_NUMBER},\"reviewers\":\"${REVIEWERS}\",\"op\":\"${OP}\"}" "[]" "{}"
    ;;
  comment)
    if [[ -z "$TEXT" ]]; then json_err "MISSING_TEXT" "Provide --text" "{}"; exit 1; fi
    pr_comment_safe "$PR_NUMBER" "$TEXT"
    json_ok "$ACTION" "{\"pr\":${PR_NUMBER},\"commented\":true}" "[]" "{}"
    ;;
  link-issues)
    if [[ -z "$ISSUES" ]]; then json_err "MISSING_ISSUES" "Provide --issues" "{}"; exit 1; fi
    pr_link_issues "$PR_NUMBER" "$ISSUES" "$LINK_TYPE"
    json_ok "$ACTION" "{\"pr\":${PR_NUMBER},\"issues\":\"${ISSUES}\",\"linkType\":\"${LINK_TYPE}\"}" "[]" "{}"
    ;;
  *)
    json_err "BAD_ACTION" "Unknown action" "{\"action\":\"$ACTION_ARG\"}"; exit 1
    ;;
esac
