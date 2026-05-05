#!/usr/bin/env bash
# Analyze PR reviews/comments and create FIX tasks for must-fix items. Strict JSON summary.
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd jq
ACTION="pr.review"

# Args: optional --pr N
PR_NUMBER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_NUMBER="$2"; shift 2 ;;
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

# Fetch data
PR_INFO=$(gh pr view "$PR_NUMBER" --json title,author,state,baseRefName,headRefName,url 2>/dev/null || echo "{}")
REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews" --paginate 2>/dev/null || echo "[]")
REVIEW_COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --paginate 2>/dev/null || echo "[]")
ISSUE_COMMENTS=$(gh api "repos/{owner}/{repo}/issues/$PR_NUMBER/comments" --paginate 2>/dev/null || echo "[]")
CHECKS=$(gh pr checks "$PR_NUMBER" --json name,status,conclusion 2>/dev/null || echo "[]")

approved=$(echo "$REVIEWS" | jq '[.[] | select(.state=="APPROVED")] | length')
changes_req=$(echo "$REVIEWS" | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')
total_comments=$(( $(echo "$REVIEW_COMMENTS" | jq 'length') + $(echo "$ISSUE_COMMENTS" | jq 'length') ))

# Must-fix detection (keyword-based)
must_fix_items=$(echo "$REVIEW_COMMENTS" | jq '[.[] | select((.body|ascii_downcase)|test("must|required|blocker|critical|has to be")) | {body:.body,path:.path,line:(.line//.original_line//0),author:(.user.login//""),url:.html_url}]')
must_fix_count=$(echo "$must_fix_items" | jq 'length')

created_tasks=()
if (( must_fix_count > 0 )); then
  num=1
  while read -r item; do
    body=$(echo "$item" | jq -r .body)
    path=$(echo "$item" | jq -r .path)
    line=$(echo "$item" | jq -r .line)
    author=$(echo "$item" | jq -r .author)
    url=$(echo "$item" | jq -r .url)
    task_id="FIX-PR${PR_NUMBER}-$(printf "%03d" "$num")"
    task_file=".holicode/specs/tasks/${task_id}.md"
    mkdir -p ".holicode/specs/tasks"
    cat > "$task_file" <<MD
# ${task_id}: Fix Review Feedback from PR #${PR_NUMBER}

## Issue
${body}

## Source
- PR: #${PR_NUMBER}
- Reviewer: @${author}
- Comment: ${url}
- File: ${path}
- Line: ${line}

## Acceptance Criteria
- [ ] Issue addressed according to feedback
- [ ] Tests pass
- [ ] Reviewer approves fix
MD
    created_tasks+=("$task_id")
    num=$((num+1))
  done < <(echo "$must_fix_items" | jq -c '.[]')
fi

# Build result JSON
result=$(jq -n \
  --argjson pr "$PR_INFO" \
  --argjson approved "$approved" \
  --argjson changesReq "$changes_req" \
  --argjson totalComments "$total_comments" \
  --argjson checks "$CHECKS" \
  --argjson mustFix "$must_fix_items" \
  --arg created "$(printf "%s\n" "${created_tasks[@]}" | jq -R . | jq -s .)" \
  '{
    pr: $pr,
    approvals: $approved,
    changesRequested: $changesReq,
    totalComments: $totalComments,
    checks: $checks,
    mustFix: $mustFix,
    createdTasks: $created
  }')

json_ok "$ACTION" "$result" "[]" "{}"
