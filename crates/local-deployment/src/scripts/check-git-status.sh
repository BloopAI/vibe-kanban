#!/bin/bash
export GIT_TERMINAL_PROMPT=0
export GIT_PAGER=cat
export NO_COLOR=1

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  exit 0
fi

UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
if git diff --quiet && git diff --cached --quiet && [ -z "$UNTRACKED" ]; then
  exit 0
fi

STATUS=$(git status --short 2>/dev/null)
DIFF_STAT=$(git diff --stat 2>/dev/null)
STAGED_STAT=$(git diff --cached --stat 2>/dev/null)

MESSAGE="There are uncommitted changes. Please stage and commit them now with a descriptive commit message.

git status:
$STATUS"

if [ -n "$STAGED_STAT" ]; then
  MESSAGE="$MESSAGE

Staged changes:
$STAGED_STAT"
fi

if [ -n "$DIFF_STAT" ]; then
  MESSAGE="$MESSAGE

Unstaged changes:
$DIFF_STAT"
fi

if [ -n "$UNTRACKED" ]; then
  MESSAGE="$MESSAGE

Untracked files:
$UNTRACKED"
fi

MESSAGE=$(echo "$MESSAGE" | jq -Rs .)
printf '{"decision":"block","reason":%s}' "$MESSAGE"
