#!/bin/bash
# forgejo-adopt.sh — Register local repos into the Forgejo sidecar as native mirrors
#
# Usage:
#   forgejo-adopt.sh                    # sync current repo (auto-detected from cwd)
#   forgejo-adopt.sh <repo-name>        # mirror/sync one repo from /home/coder/<repo>
#   forgejo-adopt.sh --all              # mirror/sync all repos in /home/coder/
#
# Uses Forgejo's native mirror feature (POST /repos/migrate + POST /repos/mirror-sync).
# Forgejo owns the fetch cycle and keeps its DB in sync natively — no manual branch
# registration or refspec workarounds needed.
#
# Requirements: runs inside the Coder workspace container.
#   - Forgejo reachable at http://localhost:3001 (via socat proxy)
#   - Forgejo configured with ALLOW_LOCALNETWORKS=true (set via env var in main.tf)
#   - Credentials: $CODER_WORKSPACE_OWNER_NAME / coder-forgejo-local

set -e

FORGEJO_URL="http://localhost:3001"
ADMIN_PASS="coder-forgejo-local"

# Set by workspace_env coder_script via /etc/profile.d/coder-workspace.sh on every start.
if [ -z "${CODER_WORKSPACE_OWNER_NAME:-}" ]; then
  echo "ERROR: CODER_WORKSPACE_OWNER_NAME not set. Open a new shell or: export CODER_WORKSPACE_OWNER_NAME=<username>" >&2
  exit 1
fi
ADMIN_USER="$CODER_WORKSPACE_OWNER_NAME"

# ── helpers ──────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

# Detect repo name from current working directory.
# Works from a git worktree: git-common-dir points to the main repo's .git.
current_repo() {
  local common
  common=$(git rev-parse --git-common-dir 2>/dev/null) || die "Not inside a git repo"
  basename "$(dirname "$common")"
}

forgejo_alive() {
  curl -sf --max-time 5 "$FORGEJO_URL/api/v1/version" > /dev/null 2>&1
}

mirror_repo() {
  local name="$1"
  local repo_path="/home/coder/$name"
  [ -d "$repo_path/.git" ] || die "Not a git repo: $repo_path"

  local exists
  exists=$(curl -so /dev/null -w '%{http_code}' --max-time 10 \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name" 2>/dev/null)

  if [ "$exists" = "200" ]; then
    echo "Triggering sync: $name"
    curl -sf --max-time 60 \
      -X POST "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/mirror-sync" \
      -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null && echo "  Sync triggered — Forgejo updates in ~10s"
  else
    echo "Creating mirror: $name"
    http_code=$(curl -s -o /tmp/forgejo-migrate-resp.json -w '%{http_code}' --max-time 120 \
      -X POST "$FORGEJO_URL/api/v1/repos/migrate" \
      -u "$ADMIN_USER:$ADMIN_PASS" \
      -H "Content-Type: application/json" \
      -d "{\"clone_addr\":\"file:///home/coder/$name\",\"repo_name\":\"$name\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":false}" \
      2>/dev/null)
    if [ "$http_code" = "201" ]; then
      echo "  Mirror created: $name (Forgejo cloning in background)"
    elif [ "$http_code" = "409" ]; then
      # Stale git dir exists in Forgejo's repo root but has no DB entry.
      # Remove it and retry once.
      stale_dir="/home/coder/.forgejo-mirrors/$ADMIN_USER/$name.git"
      echo "  409 conflict — removing stale dir $stale_dir and retrying..."
      rm -rf "$stale_dir"
      http_code=$(curl -s -o /tmp/forgejo-migrate-resp.json -w '%{http_code}' --max-time 120 \
        -X POST "$FORGEJO_URL/api/v1/repos/migrate" \
        -u "$ADMIN_USER:$ADMIN_PASS" \
        -H "Content-Type: application/json" \
        -d "{\"clone_addr\":\"file:///home/coder/$name\",\"repo_name\":\"$name\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":false}" \
        2>/dev/null)
      if [ "$http_code" = "201" ]; then
        echo "  Mirror created: $name"
      else
        echo "  ERROR HTTP $http_code after retry: $(cat /tmp/forgejo-migrate-resp.json 2>/dev/null)" >&2
      fi
    else
      echo "  ERROR HTTP $http_code: $(cat /tmp/forgejo-migrate-resp.json 2>/dev/null)" >&2
      echo "  Hint: ensure FORGEJO__migrations__ALLOW_LOCALNETWORKS=true is set in the Forgejo container" >&2
    fi
  fi
}

# ── main ─────────────────────────────────────────────────────────────────────

forgejo_alive || die "Forgejo not reachable at $FORGEJO_URL — is the workspace running?"

case "${1:-}" in
  --all)
    echo "Mirroring all repos in /home/coder/..."
    for repo_path in /home/coder/*/; do
      repo_path="${repo_path%/}"
      [ -d "$repo_path/.git" ] || continue
      mirror_repo "$(basename "$repo_path")"
    done
    ;;
  "")
    mirror_repo "$(current_repo)"
    ;;
  *)
    mirror_repo "$1"
    ;;
esac
