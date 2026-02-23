#!/usr/bin/env bash
# Blocks net-new files in legacy frontend paths during the structure migration.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST_FILE="$REPO_ROOT/scripts/legacy-frontend-paths-allowlist.txt"

LEGACY_PATHS=(
  "packages/local-web/src/components/ui-new"
  "packages/local-web/src/components/dialogs"
)

echo "▶️  Checking for net-new files in legacy frontend paths..."

if [ ! -f "$ALLOWLIST_FILE" ]; then
  echo "❌ Missing allowlist: $ALLOWLIST_FILE"
  exit 1
fi

current_files="$(
  git -C "$REPO_ROOT" ls-files "${LEGACY_PATHS[@]}" | LC_ALL=C sort
)"
allowed_files="$(
  grep -v '^\s*#' "$ALLOWLIST_FILE" | sed '/^\s*$/d' | LC_ALL=C sort
)"

new_files="$(
  comm -13 <(printf '%s\n' "$allowed_files") <(printf '%s\n' "$current_files")
)"

if [ -n "$new_files" ]; then
  echo "❌ New files found in frozen legacy paths:"
  printf '  - %s\n' $new_files
  echo ""
  echo "Add files to non-legacy paths (app/pages/widgets/features/entities/shared/integrations) instead."
  exit 1
fi

removed_files="$(
  comm -23 <(printf '%s\n' "$allowed_files") <(printf '%s\n' "$current_files")
)"
if [ -n "$removed_files" ]; then
  echo "ℹ️  Some allowlisted legacy files were removed. You can prune stale entries in:"
  echo "   scripts/legacy-frontend-paths-allowlist.txt"
fi

echo "✅ No net-new files in legacy frontend paths."
