#!/usr/bin/env bash
# Git Core: Commit operations (analyze/generate/stage/commit/push/status/validate-message)
# - Strict JSON output via scripts/lib/json.sh
# - Robust guards via scripts/lib/common.sh and shared libs
# - Non-blocking push; conventional commit validation with warnings
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd git
require_cmd jq

ACTION="git.commit"

# Args / defaults
ACTION_ARG=""
TYPE=""
SCOPE=""
SUBJECT=""
BODY=""
WORKFLOW=""
CONTEXT=""
AUTO_DETECT=0
AMEND=0
NO_PUSH=0
STAGE_MODE="" # specification|implementation|state|documentation|workflow|all
MESSAGE=""    # optional fully composed message

usage() {
  cat <<'USG'
Usage:
  scripts/git/commit.sh --action auto [--workflow NAME --context ID] [--type t --scope s --subject "text"] [--body "text"] [--amend] [--no-push]
  scripts/git/commit.sh --action commit --type t --scope s --subject "text" [--body "text"] [--amend] [--no-push]
  scripts/git/commit.sh --action analyze
  scripts/git/commit.sh --action status
  scripts/git/commit.sh --action validate-message --message "feat(scope): subject"
  scripts/git/commit.sh --action commit --message "feat(scope): subject" [--body "text"] [--amend] [--no-push]
  scripts/git/commit.sh --action auto --stage specification|implementation|state|documentation|workflow|all

Notes:
- auto: derives type/scope/subject from --workflow/--context and changed files; explicit flags override
- commit: uses provided type/scope/subject OR --message (takes precedence)
- analyze: outputs change category and file lists
- status: outputs latest commit summary
- validate-message: returns boolean validity for conventional commit format
USG
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) ACTION_ARG="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --subject) SUBJECT="$2"; shift 2 ;;
    --body) BODY="$2"; shift 2 ;;
    --workflow) WORKFLOW="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --auto-detect) AUTO_DETECT=1; shift ;;
    --amend) AMEND=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --stage) STAGE_MODE="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) shift ;;
  esac
done

# Preconditions
if ! ensure_repo; then
  json_err "NOT_A_GIT_REPO" "Not a git repository" "{}"; exit 1
fi
ensure_identity

# Helpers

# Determine category from working tree changes
detect_category() {
  # Use porcelain to include untracked
  local files
  files=$(git status --porcelain | awk '{print $2}')
  local cat="general"

  if echo "$files" | grep -qE '^src/'; then cat="implementation"; fi
  if echo "$files" | grep -qE '^\.(holicode|holicode)/specs/'; then cat="specification"; fi
  if echo "$files" | grep -qE '^\.(holicode|holicode)/state/'; then cat="state"; fi
  if echo "$files" | grep -qE '^docs/|^README\.md$'; then cat="documentation"; fi
  if echo "$files" | grep -qE '^workflows/|^\.github/agents/|^\.github/skills/|^\.clinerules/'; then cat="workflow"; fi

  echo "$cat"
}

# Stage according to category or explicit stage mode
stage_files() {
  local mode="$1"
  case "$mode" in
    specification)
      git add ".holicode/specs" 2>/dev/null || true
      git add ".holicode/state" 2>/dev/null || true
      ;;
    implementation)
      git add "src" 2>/dev/null || true
      git add "*.json" 2>/dev/null || true
      git add "*.config.*" 2>/dev/null || true
      git add "*.[jt]s" 2>/dev/null || true
      git add "*.[jt]sx" 2>/dev/null || true
      git add "package*.json" 2>/dev/null || true
      git add "pnpm-lock.yaml" "yarn.lock" 2>/dev/null || true
      ;;
    state)
      git add ".holicode/state" 2>/dev/null || true
      ;;
    documentation)
      git add "docs" 2>/dev/null || true
      git add "README.md" 2>/dev/null || true
      ;;
    workflow)
      git add "workflows" 2>/dev/null || true
      git add ".github/agents" ".github/skills" 2>/dev/null || true
      git add ".clinerules" 2>/dev/null || true
      ;;
    all|"")
      git add -A
      ;;
    *)
      git add -A
      ;;
  esac
}

# Generate commit message from workflow+context when not explicitly provided
generate_message_from_context() {
  local wf="$1" ctx="$2"
  local t="chore" sc="project" sj="update project files"
  case "$wf" in
    business-analyze)
      t="docs"; sc="specs"; sj="add business context for ${ctx}"
      ;;
    functional-analyze)
      t="docs"; sc="specs"; sj="add functional requirements for ${ctx}"
      ;;
    technical-design)
      t="docs"; sc="td"; sj="add technical design for ${ctx}"
      ;;
    implementation-plan)
      t="docs"; sc="specs"; sj="add implementation tasks for ${ctx}"
      ;;
    task-implement)
      t="feat"; sc="${ctx:-impl}"; sj="apply implementation for ${ctx:-work item}"
      ;;
    state-update)
      t="chore"; sc="state"; sj="update project state and context"
      ;;
    *)
      t="${TYPE:-chore}"; sc="${SCOPE:-project}"; sj="${SUBJECT:-update project files}"
      ;;
  esac
  echo "${t}(${sc}): ${sj}"
}

# Validate message against conventional commit pattern
validate_message() {
  local msg="$1"
  if echo "$msg" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\([^)]+\))?: .+'; then
    echo "true"
  else
    echo "false"
  fi
}

# Emit status JSON for latest commit
emit_status_json() {
  local line
  line=$(latest_commit_summary || echo "")
  local hash subject ci
  hash=$(echo "$line" | awk -F'|' '{print $1}')
  subject=$(echo "$line" | awk -F'|' '{print $2}')
  ci=$(echo "$line" | awk -F'|' '{print $3}')
  jq -n --arg hash "$hash" --arg subject "$subject" --arg committedAt "$ci" \
    '{hash:$hash,subject:$subject,committedAt:$committedAt}'
}

# Compute working tree/staged counts
counts_json() {
  local staged total
  staged=$(git diff --cached --name-only | wc -l | tr -d ' ')
  total=$(git status --porcelain | wc -l | tr -d ' ')
  jq -n --argjson staged "$staged" --argjson total "$total" '{staged:$staged,total:$total}'
}

# Main
case "$ACTION_ARG" in
  analyze)
    category=$(detect_category)
    files=$(git status --porcelain | awk '{print $2}' | jq -R . | jq -s .)
    result=$(jq -n \
      --arg category "$category" \
      --argjson files "${files:-[]}" \
      --argjson counts "$(counts_json)" \
      '{category:$category, files:$files, counts:$counts}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  validate-message)
    if [[ -z "$MESSAGE" ]]; then
      json_err "BAD_REQUEST" "Missing --message" "{}"; exit 1
    fi
    valid=$(validate_message "$MESSAGE")
    json_ok "$ACTION" "$(jq -n --arg msg "$MESSAGE" --argjson valid "$valid" '{message:$msg, valid:$valid}')" "[]" "{}"
    ;;

  status)
    json_ok "$ACTION" "$(emit_status_json)" "[]" "{}"
    ;;

  auto|commit)
    # Determine category and stage
    category="$STAGE_MODE"
    if [[ -z "$category" || "$category" = "all" ]]; then
      category=$(detect_category)
    fi
    stage_files "$category"

    # If still nothing staged, try to add all as fallback
    staged_count=$(git diff --cached --name-only | wc -l | tr -d ' ')
    if [[ "$staged_count" -eq 0 ]]; then
      stage_files "all"
      staged_count=$(git diff --cached --name-only | wc -l | tr -d ' ')
    fi

    if [[ "$staged_count" -eq 0 ]]; then
      json_err "NO_CHANGES" "No changes to commit" "{}"; exit 1
    fi

    # Compose message
    commit_msg=""
    if [[ -n "$MESSAGE" ]]; then
      commit_msg="$MESSAGE"
    elif [[ -n "$TYPE" && -n "$SUBJECT" ]]; then
      # Prefer provided type/scope/subject
      scope_part="${SCOPE:+($SCOPE)}"
      commit_msg="${TYPE}${scope_part}: ${SUBJECT}"
    else
      commit_msg=$(generate_message_from_context "$WORKFLOW" "$CONTEXT")
    fi

    # Append body if provided
    if [[ -n "$BODY" ]]; then
      commit_msg="${commit_msg}

${BODY}"
    fi

    # Validate message; warn if non-conventional (do not block)
    warnings="[]"
    if [[ "$(validate_message "$commit_msg")" != "true" ]]; then
      warnings=$(jq -n '[{"code":"NON_CONVENTIONAL_MESSAGE","message":"Commit does not match conventional commit format"}]')
    fi

    # Commit (with optional amend)
    if [[ "$AMEND" -eq 1 ]]; then
      git commit --amend -m "$commit_msg" >/dev/null 2>&1 || {
        # retry once after ensuring identity
        ensure_identity
        git commit --amend -m "$commit_msg" >/dev/null 2>&1
      }
      amended=true
    else
      git commit -m "$commit_msg" >/dev/null 2>&1 || {
        ensure_identity
        git commit -m "$commit_msg" >/dev/null 2>&1
      }
      amended=false
    fi

    branch=$(git branch --show-current 2>/dev/null || echo "")
    hash=$(git rev-parse HEAD 2>/dev/null || echo "")
    pushed=false

    if [[ "$NO_PUSH" -eq 0 ]]; then
      # Non-blocking push; do not use force by default for regular commits
      if git push origin HEAD >/dev/null 2>&1; then
        pushed=true
      fi
    fi

    files_staged=$(git diff --name-only --cached --diff-filter=AMRT | jq -R . | jq -s .)
    metrics=$(jq -n \
      --argjson counts "$(counts_json)" \
      --arg branch "$branch" \
      '{branch:$branch, counts:$counts}')

    result=$(jq -n \
      --arg mode "$ACTION_ARG" \
      --arg hash "$hash" \
      --arg branch "$branch" \
      --arg message "$commit_msg" \
      --arg category "$category" \
      --argjson stagedFiles "${files_staged:-[]}" \
      --argjson pushed "$pushed" \
      --argjson amended "$amended" \
      '{
        mode:$mode,
        commit:$hash,
        branch:$branch,
        message:$message,
        category:$category,
        stagedFiles:$stagedFiles,
        pushed:$pushed,
        amended:$amended
      }')

    json_ok "$ACTION" "$result" "$warnings" "$metrics"
    ;;

  *)
    json_err "BAD_ACTION" "Unknown action" "{\"action\":\"$ACTION_ARG\"}"; exit 1
    ;;
esac
