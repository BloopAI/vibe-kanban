#!/usr/bin/env bash
# Git Core: Worktree operations (create/remove/list/status)
# - Branch naming: bot/<simple-id>-<unix-ts>
# - Concurrent-safe: unique branch per worktree via timestamp
# - Cleanup via remove --force wrapped in try/finally
# - Strict JSON output via scripts/lib/json.sh
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_cmd git
require_cmd jq

ACTION="git.worktree"

# Defaults
ACTION_ARG=""
SIMPLE_ID=""
WORKTREE_PATH=""
BASE="${BASE_BRANCH:-main}"

usage() {
  cat <<'USG'
Usage:
  scripts/git/worktree.sh --action create --simple-id HOL-86 [--base main] [--path /tmp/wt/hol-86]
  scripts/git/worktree.sh --action remove --path /tmp/wt/hol-86
  scripts/git/worktree.sh --action list
  scripts/git/worktree.sh --action status --path /tmp/wt/hol-86

Actions:
  create   Create a new worktree with branch bot/<simple-id>-<unix-ts>
  remove   Force-remove a worktree and delete its branch
  list     List all worktrees with metadata
  status   Show status of a specific worktree

Notes:
- Branch names use bot/<simple-id>-<unix-ts> for concurrent safety
- remove uses --force to handle dirty worktrees
- Branch is deleted after worktree removal (local + remote)
USG
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) ACTION_ARG="$2"; shift 2 ;;
    --simple-id) SIMPLE_ID="$2"; shift 2 ;;
    --path) WORKTREE_PATH="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) json_err "BAD_REQUEST" "Unknown flag: $1" "{}"; exit 1 ;;
    *) json_err "BAD_REQUEST" "Unexpected argument: $1" "{}"; exit 1 ;;
  esac
done

if [[ -z "$ACTION_ARG" ]]; then
  json_err "BAD_REQUEST" "Missing --action" "{}"; exit 1
fi

# Preconditions — check from the main repo (or any linked worktree)
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  json_err "NOT_A_GIT_REPO" "Not inside a git repository or worktree" "{}"; exit 1
fi
ensure_identity

case "$ACTION_ARG" in
  create)
    if [[ -z "$SIMPLE_ID" ]]; then
      json_err "BAD_REQUEST" "create requires --simple-id (e.g. HOL-86)" "{}"; exit 1
    fi

    # Normalise simple-id to lowercase for branch name
    local_id="$(echo "$SIMPLE_ID" | tr '[:upper:]' '[:lower:]')"
    unix_ts="$(date +%s)"
    branch="bot/${local_id}-${unix_ts}"

    # Determine worktree path
    if [[ -z "$WORKTREE_PATH" ]]; then
      WORKTREE_PATH="/tmp/worktrees/${local_id}-${unix_ts}"
    fi

    # Ensure parent directory exists
    mkdir -p "$(dirname "$WORKTREE_PATH")"

    # Ensure base branch is up to date (best-effort)
    git fetch origin "$BASE" >/dev/null 2>&1 || true

    # Resolve base ref (prefer origin/<base> if it exists)
    base_ref="$BASE"
    if git rev-parse --verify "origin/$BASE" >/dev/null 2>&1; then
      base_ref="origin/$BASE"
    fi

    # Create worktree with new branch
    # On failure, clean up any partial worktree
    cleanup_needed=false
    trap_cleanup() {
      if [[ "$cleanup_needed" = true && -d "$WORKTREE_PATH" ]]; then
        git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
        git branch -D "$branch" 2>/dev/null || true
      fi
    }
    trap trap_cleanup EXIT

    cleanup_needed=true
    git worktree add -b "$branch" "$WORKTREE_PATH" "$base_ref" >&2
    cleanup_needed=false

    # Resolve absolute path
    abs_path="$(cd "$WORKTREE_PATH" && pwd)"

    # Get the commit we landed on
    head_sha="$(git -C "$abs_path" rev-parse HEAD 2>/dev/null || echo "unknown")"

    result=$(jq -n \
      --arg mode "create" \
      --arg branch "$branch" \
      --arg path "$abs_path" \
      --arg base "$BASE" \
      --arg simple_id "$SIMPLE_ID" \
      --arg head "$head_sha" \
      '{mode:$mode, branch:$branch, path:$path, base:$base, simpleId:$simple_id, head:$head}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  remove)
    if [[ -z "$WORKTREE_PATH" ]]; then
      json_err "BAD_REQUEST" "remove requires --path" "{}"; exit 1
    fi

    # Resolve the branch before removing (try directory first, fall back to porcelain)
    branch=""
    if [[ -d "$WORKTREE_PATH" ]]; then
      branch="$(git -C "$WORKTREE_PATH" branch --show-current 2>/dev/null || echo "")"
    fi
    if [[ -z "$branch" ]]; then
      # Fall back to git worktree list --porcelain to find the branch
      abs_remove_path="$(readlink_f "$WORKTREE_PATH" 2>/dev/null || echo "$WORKTREE_PATH")"
      in_block=false
      while IFS= read -r line; do
        if [[ "$line" =~ ^worktree\ (.+) ]]; then
          if [[ "${BASH_REMATCH[1]}" == "$abs_remove_path" || "${BASH_REMATCH[1]}" == "$WORKTREE_PATH" ]]; then
            in_block=true
          else
            in_block=false
          fi
        elif $in_block && [[ "$line" =~ ^branch\ refs/heads/(.+) ]]; then
          branch="${BASH_REMATCH[1]}"
          break
        fi
      done < <(git worktree list --porcelain 2>/dev/null)
    fi

    # Check if the path is a known worktree before attempting removal
    known_worktree=false
    abs_check_path="$(readlink_f "$WORKTREE_PATH" 2>/dev/null || echo "$WORKTREE_PATH")"
    while IFS= read -r wt_line; do
      if [[ "$wt_line" =~ ^worktree\ (.+) ]]; then
        if [[ "${BASH_REMATCH[1]}" == "$abs_check_path" || "${BASH_REMATCH[1]}" == "$WORKTREE_PATH" ]]; then
          known_worktree=true
          break
        fi
      fi
    done < <(git worktree list --porcelain 2>/dev/null)

    # Also consider it known if the directory exists and is a git worktree
    if ! $known_worktree && [[ -d "$WORKTREE_PATH" ]]; then
      if git -C "$WORKTREE_PATH" rev-parse --git-dir >/dev/null 2>&1; then
        known_worktree=true
      fi
    fi

    if ! $known_worktree; then
      json_err "NOT_FOUND" "Path is not a known worktree" "{\"path\":\"$WORKTREE_PATH\"}"
      exit 1
    fi

    # Force-remove the worktree (handles dirty state)
    removed_worktree=false
    removed_branch=false
    pushed_delete=false
    warnings="[]"

    if git worktree remove --force "$WORKTREE_PATH" 2>/dev/null; then
      removed_worktree=true
    elif [[ ! -d "$WORKTREE_PATH" ]]; then
      # Directory already gone but git still tracks the entry; prune it
      git worktree prune 2>/dev/null || true
      removed_worktree=true
    else
      json_err "REMOVE_FAILED" "git worktree remove --force failed" "{\"path\":\"$WORKTREE_PATH\"}"
      exit 1
    fi

    # Delete the branch if we identified one and it's a bot/ branch
    if [[ -n "$branch" && "$branch" == bot/* ]]; then
      if git branch -D "$branch" >/dev/null 2>&1; then
        removed_branch=true
      fi
      # Attempt remote branch cleanup (non-blocking)
      if git push origin --delete "$branch" >/dev/null 2>&1; then
        pushed_delete=true
      fi
    elif [[ -n "$branch" && "$branch" != bot/* ]]; then
      warnings=$(jq -n '["Branch '"$branch"' is not a bot/* branch; skipped branch deletion"]')
    fi

    result=$(jq -n \
      --arg mode "remove" \
      --arg path "$WORKTREE_PATH" \
      --arg branch "$branch" \
      --argjson removed_worktree "$removed_worktree" \
      --argjson removed_branch "$removed_branch" \
      --argjson pushed_delete "$pushed_delete" \
      '{mode:$mode, path:$path, branch:$branch, removedWorktree:$removed_worktree, removedBranch:$removed_branch, pushedDelete:$pushed_delete}')
    json_ok "$ACTION" "$result" "$warnings" "{}"
    ;;

  list)
    # Parse git worktree list --porcelain into JSON
    worktrees="[]"
    current_wt=""
    current_head=""
    current_branch=""

    while IFS= read -r line; do
      if [[ "$line" =~ ^worktree\ (.+) ]]; then
        # Emit previous entry if exists
        if [[ -n "$current_wt" ]]; then
          worktrees=$(echo "$worktrees" | jq \
            --arg path "$current_wt" \
            --arg head "$current_head" \
            --arg branch "$current_branch" \
            '. + [{path:$path, head:$head, branch:$branch}]')
        fi
        current_wt="${BASH_REMATCH[1]}"
        current_head=""
        current_branch=""
      elif [[ "$line" =~ ^HEAD\ (.+) ]]; then
        current_head="${BASH_REMATCH[1]}"
      elif [[ "$line" =~ ^branch\ refs/heads/(.+) ]]; then
        current_branch="${BASH_REMATCH[1]}"
      elif [[ "$line" == "detached" ]]; then
        current_branch="(detached)"
      fi
    done < <(git worktree list --porcelain 2>/dev/null)

    # Emit last entry
    if [[ -n "$current_wt" ]]; then
      worktrees=$(echo "$worktrees" | jq \
        --arg path "$current_wt" \
        --arg head "$current_head" \
        --arg branch "$current_branch" \
        '. + [{path:$path, head:$head, branch:$branch}]')
    fi

    # Count bot/ worktrees separately
    bot_count=$(echo "$worktrees" | jq '[.[] | select(.branch | startswith("bot/"))] | length')
    total_count=$(echo "$worktrees" | jq 'length')

    result=$(jq -n \
      --arg mode "list" \
      --argjson worktrees "$worktrees" \
      --argjson total "$total_count" \
      --argjson bot_count "$bot_count" \
      '{mode:$mode, worktrees:$worktrees, total:$total, botCount:$bot_count}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  status)
    if [[ -z "$WORKTREE_PATH" ]]; then
      json_err "BAD_REQUEST" "status requires --path" "{}"; exit 1
    fi

    if [[ ! -d "$WORKTREE_PATH" ]]; then
      json_err "NOT_FOUND" "Worktree path does not exist" "{\"path\":\"$WORKTREE_PATH\"}"
      exit 1
    fi

    # Gather worktree info
    branch="$(git -C "$WORKTREE_PATH" branch --show-current 2>/dev/null || echo "")"
    head_sha="$(git -C "$WORKTREE_PATH" rev-parse HEAD 2>/dev/null || echo "unknown")"
    dirty=false
    if [[ -n "$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null)" ]]; then
      dirty=true
    fi

    # Count commits ahead of base (if base exists)
    ahead=0
    if git rev-parse --verify "$BASE" >/dev/null 2>&1; then
      ahead=$(git -C "$WORKTREE_PATH" rev-list --count "$BASE..HEAD" 2>/dev/null || echo "0")
    fi

    result=$(jq -n \
      --arg mode "status" \
      --arg path "$WORKTREE_PATH" \
      --arg branch "$branch" \
      --arg head "$head_sha" \
      --argjson dirty "$dirty" \
      --argjson ahead "$ahead" \
      '{mode:$mode, path:$path, branch:$branch, head:$head, dirty:$dirty, ahead:$ahead}')
    json_ok "$ACTION" "$result" "[]" "{}"
    ;;

  *)
    json_err "BAD_ACTION" "Unknown action" "{\"action\":\"$ACTION_ARG\"}"; exit 1
    ;;
esac
