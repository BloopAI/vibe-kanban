#!/usr/bin/env bash
# GitHub CLI helpers
set -Eeuo pipefail
IFS=$'\n\t'

# Ensure gh CLI is available and authenticated
# Returns:
#   0 - ok
#   2 - gh missing
#   3 - gh unauthenticated
gh_guard() {
  if ! command -v gh >/dev/null 2>&1; then
    return 2
  fi
  if ! gh auth status >/dev/null 2>&1; then
    return 3
  fi
  return 0
}

# Detect current PR number for the active branch. Empty if none.
detect_current_pr_number() {
  gh pr view --json number -q .number 2>/dev/null || true
}

# Fetch PR checks summary JSON. Returns [] on error.
get_pr_checks_json() {
  local pr=$1
  gh pr checks "$pr" --json name,status,conclusion 2>/dev/null || echo "[]"
}

# Append a comment to PR. Silent failure tolerant.
pr_comment_safe() {
  local pr=$1
  local text=$2
  gh pr comment "$pr" --body "$text" >/dev/null 2>&1 || true
}

# Add or remove labels; op in add|remove
pr_labels_edit() {
  local pr=$1 op=$2 labels=$3
  case "$op" in
    add) gh pr edit "$pr" --add-label "$labels" >/dev/null 2>&1 || true ;;
    remove) gh pr edit "$pr" --remove-label "$labels" >/dev/null 2>&1 || true ;;
  esac
}

# Set labels (replace all existing)
pr_labels_set() {
  local pr=$1 labels=$2
  local current
  current=$(gh pr view "$pr" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
  if [[ -n "$current" ]]; then gh pr edit "$pr" --remove-label "$current" >/dev/null 2>&1 || true; fi
  if [[ -n "$labels" ]]; then gh pr edit "$pr" --add-label "$labels" >/dev/null 2>&1 || true; fi
}

# Reviewers edit; op in add|remove
pr_reviewers_edit() {
  local pr=$1 op=$2 reviewers=$3
  case "$op" in
    add) gh pr edit "$pr" --add-reviewer "$reviewers" >/dev/null 2>&1 || true ;;
    remove) gh pr edit "$pr" --remove-reviewer "$reviewers" >/dev/null 2>&1 || true ;;
  esac
}

# Link issues by appending to body. linkType in closes|fixes|related
pr_link_issues() {
  local pr=$1 issues=$2 linkType=${3:-related}
  local body
  body=$(gh pr view "$pr" --json body -q .body 2>/dev/null)
  local out="$body"
  local word="Related to"
  case "$linkType" in
    closes) word="Closes" ;;
    fixes) word="Fixes" ;;
  esac
  for issue in $(echo "$issues" | tr ',' ' '); do
    out="${out}\n${word} #${issue}"
  done
  printf "%b" "$out" | gh pr edit "$pr" --body-file - >/dev/null 2>&1 || true
}
