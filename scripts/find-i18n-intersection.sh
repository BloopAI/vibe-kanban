#!/usr/bin/env bash
# Find intersection of files changed in PR and files with i18n violations
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "▶️  Getting changed files from PR..."
CHANGED_FILES=$(git diff --name-only origin/main...HEAD | grep -E '^frontend/src/.*\.(ts|tsx)$' | sed 's|^frontend/||' | sort)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c '^' || echo "0")
echo "   Found $CHANGED_COUNT changed TS/TSX files in PR"

echo "▶️  Finding files with i18n violations..."
cd frontend
VIOLATION_FILES=$(LINT_I18N=true npx eslint src --ext ts,tsx --rule "i18next/no-literal-string:error" --format json 2>&1 | \
  jq -r '.[] | select(.messages | length > 0) | .filePath' 2>/dev/null | \
  sed "s|$(pwd)/||" | sort -u || echo "")
cd ..
VIOLATION_COUNT=$(echo "$VIOLATION_FILES" | grep -c '^' || echo "0")
echo "   Found $VIOLATION_COUNT files with i18n violations"

echo "▶️  Computing intersection..."
INTERSECTION=$(comm -12 <(echo "$CHANGED_FILES") <(echo "$VIOLATION_FILES"))
INTERSECTION_COUNT=$(echo "$INTERSECTION" | grep -c '^' || echo "0")

echo ""
echo "📊 Results:"
echo "   Changed files: $CHANGED_COUNT"
echo "   Files with violations: $VIOLATION_COUNT"
echo "   Intersection (files to fix): $INTERSECTION_COUNT"
echo ""

if [ "$INTERSECTION_COUNT" -gt 0 ]; then
  echo "📝 Files that need i18n fixes (changed in PR AND have violations):"
  echo "$INTERSECTION" | sed 's|^|   frontend/|'
  echo ""
fi

exit 0
