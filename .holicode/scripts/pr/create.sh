#!/usr/bin/env bash
# Create a Pull Request with robust guards and strict JSON output
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd git
require_cmd jq

ACTION="pr.create"

# Preconditions
if ! ensure_repo; then
  json_err "NOT_A_GIT_REPO" "Not a git repository" "{}"; exit 1
fi

ensure_identity

current_branch=$(git branch --show-current 2>/dev/null || echo "")
base_branch="${BASE_BRANCH:-main}"

# Verify there are commits to PR
if [[ -z "$(git log "${base_branch}..${current_branch}" 2>/dev/null || true)" ]]; then
  json_err "NO_COMMITS" "No commits between ${base_branch} and ${current_branch}" "{\"base\":\"${base_branch}\",\"head\":\"${current_branch}\"}"
  exit 1
fi

# Determine PR type, labels, template
pr_type="general"; labels=""; template="templates/github/pr-impl-template.md"
case "$current_branch" in
  spec/*) pr_type="specification"; labels="specification"; template="templates/github/pr-spec-template.md" ;;
  feat/*) pr_type="implementation"; labels="enhancement,implementation"; template="templates/github/pr-impl-template.md" ;;
  fix/*)  pr_type="bugfix"; labels="bug"; template="templates/github/pr-fix-template.md" ;;
  chore/*) pr_type="maintenance"; labels="chore"; template="templates/github/pr-impl-template.md" ;;
esac

# Title generation
last_commit=$(git log -1 --pretty=%s || echo "")
if [[ "$last_commit" =~ ^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: ]]; then
  pr_title="$last_commit"
else
  # derive from branch
  desc=$(echo "$current_branch" | sed -E "s#^[^/]+/##" | sed -E "s/[A-Z]+-[0-9]+-?//" | tr '-' ' ')
  pr_title="${pr_type}: ${desc:-$last_commit}"
fi

# Body from template (fallback to minimal)
if [[ -f "$ROOT_DIR/$template" ]]; then
  pr_body=$(cat "$ROOT_DIR/$template")
else
  pr_body="## Summary

${pr_title}

## Changes
- See commit history"
fi

# gh CLI guard
guard_code=0
if ! gh_guard; then
  guard_code=$?
  case "$guard_code" in
    2) json_err "GH_CLI_MISSING" "GitHub CLI (gh) not found" "{}";;
    3) json_err "GH_AUTH_MISSING" "GitHub CLI not authenticated" "{}";;
    *) json_err "GH_NOT_READY" "GitHub CLI not ready" "{\"code\":$guard_code}";;
  esac
  exit 1
fi

tmpfile="$(mktemp)"; printf "%s" "$pr_body" > "$tmpfile"

# Create PR with retry/backoff (handles transient failures)
if ! gh pr create --title "$pr_title" --body-file "$tmpfile" --base "$base_branch" ${labels:+--label "$labels"} >/dev/null 2>&1; then
  if ! retry_with_backoff 3 500 gh pr create --title "$pr_title" --body-file "$tmpfile" --base "$base_branch" ${labels:+--label "$labels"} >/dev/null 2>&1; then
    rm -f "$tmpfile"
    json_err "PR_CREATE_FAILED" "Failed to create pull request" "{\"branch\":\"${current_branch}\"}"
    exit 1
  fi
fi

# Fetch PR info
pr_info=$(gh pr view --json number,url 2>/dev/null || echo "{}")
pr_number=$(echo "$pr_info" | jq -r '.number // empty')
pr_url=$(echo "$pr_info" | jq -r '.url // empty')

rm -f "$tmpfile"

if [[ -z "$pr_number" || -z "$pr_url" ]]; then
  json_err "PR_INFO_MISSING" "Created PR but could not retrieve info" "{}"; exit 1
fi

# Success
json_ok "$ACTION" "{\"prNumber\":${pr_number},\"url\":\"${pr_url}\",\"type\":\"${pr_type}\",\"branch\":\"${current_branch}\",\"base\":\"${base_branch}\"}" "[]" "{\"durationMs\":0,\"retries\":0}"
