#!/usr/bin/env bash
# i18n regression check script
# Compares i18next/no-literal-string violations between PR and main branch
# Initial implementation: This script will show high violation counts until enforcement is enabled
set -eo pipefail

WORKTREE_BASE="$(mktemp -d)"
RULE="i18next/no-literal-string"

# Function that outputs violation count to stdout
lint_count() {
  local dir=$1
  local tmp
  tmp=$(mktemp)
  
  trap 'rm -f "$tmp"' RETURN
  
  (
    set -eo pipefail
    cd "$REPO_ROOT/frontend"
    # Use ESLint from main workspace but lint files in the target directory
    LINT_I18N=true npx eslint "$dir/frontend" \
      --ext ts,tsx \
      --format json \
      --output-file "$tmp" \
      --no-error-on-unmatched-pattern \
      > /dev/null 2>&1 || true  # Don't fail on violations
  )
  
  # Parse the clean JSON file
  jq --arg RULE "$RULE" \
     '[.[].messages[] | select(.ruleId == $RULE)] | length' "$tmp" \
     || echo "0"
}

echo "▶️  Counting literal strings in PR branch..."
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PR_COUNT=$(lint_count "$REPO_ROOT")

BASE_REF="${GITHUB_BASE_REF:-main}"
echo "▶️  Checking out $BASE_REF for baseline..."
git fetch --depth=1 origin "$BASE_REF" 2>/dev/null || git fetch --depth=1 origin "$BASE_REF"
git worktree add "$WORKTREE_BASE" "origin/$BASE_REF" 2>/dev/null || {
  echo "Could not create worktree, falling back to direct checkout"
  TEMP_BRANCH="temp-i18n-check-$$"
  git checkout -b "$TEMP_BRANCH" "origin/$BASE_REF" 2>/dev/null || git checkout "origin/$BASE_REF"
  BASE_COUNT=$(lint_count "$REPO_ROOT")
  git checkout - 2>/dev/null || true
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
}

# Get base count from worktree if it was created successfully
if [ -d "$WORKTREE_BASE" ]; then
  BASE_COUNT=$(lint_count "$WORKTREE_BASE")
  git worktree remove "$WORKTREE_BASE" 2>/dev/null || rm -rf "$WORKTREE_BASE"
fi

# Ensure BASE_COUNT has a value
BASE_COUNT="${BASE_COUNT:-0}"

echo ""
echo "📊 I18n Violation Summary:"
echo "   Base branch ($BASE_REF): $BASE_COUNT violations"
echo "   PR branch: $PR_COUNT violations"
echo ""

if (( PR_COUNT > BASE_COUNT )); then
  echo "❌ PR introduces $((PR_COUNT - BASE_COUNT)) new hard-coded strings."
  echo ""
  echo "💡 To fix, replace hardcoded strings with translation calls:"
  echo "   Before: <Button>Save</Button>"
  echo "   After:  <Button>{t('buttons.save')}</Button>"
  echo ""
  echo "Files with new violations:"
  (cd "$REPO_ROOT/frontend" && LINT_I18N=true npx eslint . --ext ts,tsx --rule "$RULE:error" -f codeframe 2>/dev/null || true)
  exit 1
elif (( PR_COUNT < BASE_COUNT )); then
  echo "🎉 Great job! PR removes $((BASE_COUNT - PR_COUNT)) hard-coded strings."
  echo "   This helps improve i18n coverage!"
else
  echo "✅ No new literal strings introduced."
fi
