#!/usr/bin/env bash
# Git Core: Branch operations (create/switch/cleanup/validate)
# - Strict JSON output via scripts/lib/json.sh
# - Robust guards via scripts/lib/common.sh and shared libs
# - Cross-platform safe, non-blocking remote ops
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd git
require_cmd jq

ACTION="git.branch"

# Defaults
ACTION_ARG=""
TYPE=""
NAME=""
BASE="${BASE_BRANCH:-main}"
PHASE=""
FEATURE_ID=""
TASK_ID=""
DESCRIPTION=""
ISSUE=""
VERSION=""

usage() {
  cat <<'USG'
Usage:
  scripts/git/branch.sh --action create [--type spec|feat|fix|chore|release] [--name FULL_NAME] [--base main]
                         [--phase business|functional|technical|plan --feature-id FEATURE-123]            # spec
                         [--task-id TASK-123 --description "kebab text"]                                  # feat
                         [--issue 123 --description "kebab text"]                                         # fix
                         [--description "kebab text"]                                                     # chore
                         [--version v1.2.3]                                                               # release
  scripts/git/branch.sh --action switch --branch NAME
  scripts/git/branch.sh --action cleanup [--base main]
  scripts/git/branch.sh --action validate [--name NAME]

Notes:
- If --name is provided for create/validate, it is used directly (subject to validation)
- Remote push is attempted on create but failures are ignored (offline-safe)
USG
}

# Kebab-case normalizer for descriptions
to_kebab() {
  local d="$1"
  # lower, replace non-alnum with '-', trim and squeeze '-'
  echo "$d" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

compose_branch_name() {
  # If explicit name is provided, return it
  if [[ -n "$NAME" ]]; then
    echo "$NAME"
    return 0
  fi

  case "$TYPE" in
    spec)
      if [[ -z "$PHASE" || -z "$FEATURE_ID" ]]; then
        json_err "BAD_REQUEST" "spec requires --phase and --feature-id" "{}"; exit 1
      fi
      echo "spec/${PHASE}/${FEATURE_ID}"
      ;;
    feat)
      if [[ -z "$TASK_ID" ]]; then
        json_err "BAD_REQUEST" "feat requires --task-id" "{}"; exit 1
      fi
      local desc=""
      if [[ -n "$DESCRIPTION" ]]; then desc="$(to_kebab "$DESCRIPTION")"; fi
      if [[ -n "$desc" ]]; then
        echo "feat/${TASK_ID}-${desc}"
      else
        echo "feat/${TASK_ID}"
      fi
      ;;
    fix)
      local desc=""
      if [[ -n "$DESCRIPTION" ]]; then desc="$(to_kebab "$DESCRIPTION")"; fi
      if [[ -n "$ISSUE" && -n "$desc" ]]; then
        echo "fix/${ISSUE}-${desc}"
      elif [[ -n "$ISSUE" ]]; then
        echo "fix/${ISSUE}"
      elif [[ -n "$desc" ]]; then
        echo "fix/${desc}"
      else
        json_err "BAD_REQUEST" "fix requires --issue or --description" "{}"; exit 1
      fi
      ;;
    chore)
      if [[ -z "$DESCRIPTION" ]]; then
        json_err "BAD_REQUEST" "chore requires --description" "{}"; exit 1
      fi
      echo "chore/$(to_kebab "$DESCRIPTION")"
      ;;
    release)
      if [[ -z "$VERSION" ]]; then
        json_err "BAD_REQUEST" "release requires --version (e.g., v1.2.3)" "{}"; exit 1
      fi
      echo "release/${VERSION}"
      ;;
    *)
      json_err "BAD_REQUEST" "Unknown or missing --type; or provide --name" "{}"; exit 1
      ;;
  esac
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) ACTION_ARG="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --name|--branch) NAME="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --phase) PHASE="$2"; shift 2 ;;
    --feature-id) FEATURE_ID="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --issue) ISSUE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) shift ;;
  esac
done

if [[ -z "$ACTION_ARG" ]]; then
  json_err "BAD_REQUEST" "Missing --action" "{}"; exit 1
fi

# Preconditions
if ! ensure_repo; then
  json_err "NOT_A_GIT_REPO" "Not a git repository" "{}"; exit 1
fi
ensure_identity

case "$ACTION_ARG" in
  create)
    # determine branch name
    new_branch="$(compose_branch_name)"

    # Validate naming against project conventions
    if ! branch_name_validate "$new_branch"; then
      json_err "BAD_BRANCH_NAME" "Branch does not match conventions" "{\"name\":\"${new_branch}\"}"
      exit 1
    fi

    # Move to base, update, then create
    current_branch="$(git branch --show-current 2>/dev/null || echo "")"
    safe_checkout "$BASE" || true

    # Use stash auto-handled by safe_checkout
    git checkout -b "$new_branch"

    # Attempt to push and set upstream (non-blocking)
    pushed=false
    if git push -u origin "$new_branch" >/dev/null 2>&1; then
      pushed=true
    fi

    # Result
    result=$(jq -n \
      --arg mode "create" \
      --arg name "$new_branch" \
      --arg base "$BASE" \
      --argjson pushed "$pushed" \
      --arg previous "$current_branch" \
      '{mode:$mode, branch:$name, base:$base, pushed:$pushed, previous:$previous}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  switch)
    if [[ -z "$NAME" ]]; then
      json_err "BAD_REQUEST" "switch requires --branch NAME" "{}"; exit 1
    fi
    current_branch="$(git branch --show-current 2>/dev/null || echo "")"
    # Stash if needed and checkout target; pulls rebase if remote exists
    safe_checkout "$NAME"

    result=$(jq -n \
      --arg mode "switch" \
      --arg from "$current_branch" \
      --arg to "$NAME" \
      '{mode:$mode, from:$from, to:$to}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  cleanup)
    # Fetch and prune, then delete locals merged into base (excluding base/main/master/HEAD)
    git fetch --prune >/dev/null 2>&1 || true

    # Collect candidates
    mapfile -t merged < <(git branch --merged "$BASE" | sed -E 's/^\* //; s/^ *//; s/ *$//' | grep -vE "^(main|master|${BASE})$" || true)

    deleted=()
    for br in "${merged[@]}"; do
      if [[ -n "$br" ]]; then
        if git branch -d "$br" >/dev/null 2>&1; then
          deleted+=("$br")
        fi
      fi
    done

    # Orphaned (gone) branches (local tracking remote gone)
    mapfile -t orphaned < <(git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads | awk '$2 == "[gone]" { print $1 }' || true)

    result=$(jq -n \
      --arg mode "cleanup" \
      --arg base "$BASE" \
      --argjson deleted "$(printf '%s\n' "${deleted[@]}" | jq -R . | jq -s .)" \
      --argjson merged "$(printf '%s\n' "${merged[@]}" | jq -R . | jq -s .)" \
      --argjson orphaned "$(printf '%s\n' "${orphaned[@]}" | jq -R . | jq -s .)" \
      '{mode:$mode, base:$base, deleted:$deleted, mergedCandidates:$merged, orphaned:$orphaned}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  validate)
    check_name="$NAME"
    if [[ -z "$check_name" ]]; then
      check_name="$(git branch --show-current 2>/dev/null || echo "")"
    fi
    if [[ -z "$check_name" ]]; then
      json_err "BAD_REQUEST" "validate needs --name or an active branch" "{}"; exit 1
    fi

    valid=false
    if branch_name_validate "$check_name"; then valid=true; fi

    result=$(jq -n \
      --arg mode "validate" \
      --arg name "$check_name" \
      --argjson valid "$valid" \
      '{mode:$mode, branch:$name, valid:$valid}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  *)
    json_err "BAD_ACTION" "Unknown action" "{\"action\":\"$ACTION_ARG\"}"; exit 1
    ;;
esac
