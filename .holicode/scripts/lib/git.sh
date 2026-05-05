#!/usr/bin/env bash
# Lightweight git helpers used by entrypoints
set -Eeuo pipefail
IFS=$'\n\t'

ensure_repo() {
  [[ -d .git ]]
}

ensure_identity() {
  local name email
  name=$(git config user.name || true)
  email=$(git config user.email || true)
  if [[ -z "$name" ]]; then git config user.name "HoliCode Agent"; fi
  if [[ -z "$email" ]]; then git config user.email "agent@holicode.local"; fi
}

# Auto-stash if dirty (when auto=1). Echos "stashed" if it stashed.
ensure_clean_or_stash() {
  local auto=${1:-"1"}
  if [[ -n "$(git status --porcelain)" ]]; then
    if [[ "$auto" = "1" ]]; then
      git stash push -m "Auto-stash before operation $(date +%Y-%m-%dT%H:%M:%S)"
      echo "stashed"
    else
      return 1
    fi
  fi
  return 0
}

protected_branch_guard() {
  local br
  br=$(git branch --show-current 2>/dev/null || echo "")
  [[ "$br" != "main" && "$br" != "master" ]]
}

# Validate common branch naming patterns
branch_name_validate() {
  local name=$1
  # Allow patterns like: spec/*, feat/TASK-123-*, fix/123-*, chore/*
  if [[ "$name" =~ ^(spec\/[a-z]+\/[A-Z]+-[0-9]+|feat\/[A-Z]+-[0-9]+(-[a-z0-9-]+)?|fix\/[a-zA-Z0-9._-]+|chore\/[a-z0-9-]+|release\/v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    return 0
  fi
  return 1
}

safe_checkout() {
  local target=$1
  local stashed="$(ensure_clean_or_stash 1 || true)"
  git checkout "$target"
  if git rev-parse --verify "origin/$target" >/dev/null 2>&1; then
    git pull --rebase origin "$target" >/dev/null 2>&1 || true
  fi
  if [[ "$stashed" = "stashed" ]]; then
    # attempt restore; ignore conflicts here (caller decides)
    git stash pop >/dev/null 2>&1 || true
  fi
}

push_with_lease() {
  local ref=${1:-HEAD}
  local remote=${2:-origin}
  git push --force-with-lease "$remote" "$ref"
}

latest_commit_summary() {
  git log -1 --pretty='%H|%s|%cI'
}
