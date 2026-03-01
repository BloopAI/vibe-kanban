#!/usr/bin/env bash
# Blocks net-new files in legacy frontend paths during the structure migration.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST_FILE="$REPO_ROOT/scripts/legacy-frontend-paths-allowlist.txt"

LEGACY_PATHS=(
  "packages/local-web/src/components/ui-new"
  "packages/local-web/src/components/dialogs"
)

NAVIGATION_FILES=(
  "packages/web-core/src/shared/lib/routes/appNavigation.ts"
  "packages/web-core/src/shared/hooks/useAppNavigation.ts"
  "packages/local-web/src/app/navigation/AppNavigation.ts"
  "packages/remote-web/src/app/navigation/AppNavigation.ts"
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

echo "▶️  Checking navigation modules for explicit any..."

any_hits="$(
  grep \
    -nE \
    '(as[[:space:]]+any([^[:alnum:]_]|$)|:[[:space:]]*any([^[:alnum:]_]|$)|<any>)' \
    "${NAVIGATION_FILES[@]}" || true
)"

if [ -n "$any_hits" ]; then
  echo "❌ Explicit any found in navigation modules:"
  printf '%s\n' "$any_hits"
  exit 1
fi

echo "✅ No explicit any in navigation modules."

echo "▶️  Checking web-core for navigate({ to: '.' ... }) usage..."

dot_navigation_hits="$(
  find "$REPO_ROOT/packages/web-core/src" \
    -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -print0 |
    xargs -0 perl -0ne '
      my $content = $_;
      while ($content =~ /navigate\s*\(\s*\{[\s\S]*?\bto\s*:\s*["\x27]\.["\x27][\s\S]*?\}\s*\)/g) {
        my $line = 1 + (substr($content, 0, $-[0]) =~ tr/\n//);
        print "$ARGV:$line\n";
      }
    ' || true
)"

if [ -n "$dot_navigation_hits" ]; then
  echo "❌ Found navigate({ to: '.' ... }) usage in web-core:"
  printf '%s\n' "$dot_navigation_hits"
  echo ""
  echo "Use AppNavigation destination methods instead of route-local '.' normalization."
  exit 1
fi

echo "✅ No navigate({ to: '.' ... }) usage in web-core."
