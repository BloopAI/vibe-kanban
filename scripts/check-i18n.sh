#!/usr/bin/env bash
# i18n regression check script
# Compares i18next/no-literal-string violations between PR and main branch
# Initial implementation: This script will show high violation counts until enforcement is enabled
set -eo pipefail

RULE="i18next/no-literal-string"

# Function that outputs violation count to stdout
lint_count() {
  local dir=$1
  local tmp
  tmp=$(mktemp)
  
  trap 'rm -f "$tmp"' RETURN
  
  (
    set -eo pipefail
    cd "$dir/frontend"
    # Lint current directory using ESLint from PR workspace
    LINT_I18N=true npx --prefix "$REPO_ROOT/frontend" eslint . \
      --ext ts,tsx \
      --format json \
      --output-file "$tmp" \
      --no-error-on-unmatched-pattern \
      > /dev/null 2>&1 || true  # Don't fail on violations
  )
  
  # Parse the clean JSON file
  jq --arg RULE "$RULE" \
     '[.[].messages[] | select(.ruleId == $RULE)] | length' "$tmp" \
     2>/dev/null || echo "0"
}

get_json_keys() {
  local file=$1
  if [ ! -f "$file" ]; then
    return 2
  fi
  jq -r '
    paths(scalars) as $p
    | select(getpath($p) | type == "string")
    | $p | join(".")
  ' "$file" 2>/dev/null | LC_ALL=C sort -u
}

check_duplicate_keys() {
  local file=$1
  if [ ! -f "$file" ]; then
    return 2
  fi

  # Strategy: Use jq's --stream flag to detect duplicate keys
  # jq --stream processes JSON before parsing (preserves duplicates)
  # jq tostream processes JSON after parsing (duplicates already collapsed)
  # If the outputs differ, duplicate keys exist
  if ! diff -q <(jq --stream . "$file" 2>/dev/null) <(jq tostream "$file" 2>/dev/null) > /dev/null 2>&1; then
    # Duplicates found
    echo "duplicate keys detected"
    return 1
  fi
  return 0
}

check_duplicate_json_keys() {
  local locales_dir="$REPO_ROOT/frontend/src/i18n/locales"
  local exit_code=0

  if [ ! -d "$locales_dir" ]; then
    echo "❌ Locales directory not found: $locales_dir"
    return 1
  fi

  # Check all JSON files in all locale directories
  while IFS= read -r file; do
    local rel_path="${file#$locales_dir/}"
    local duplicates

    if duplicates=$(check_duplicate_keys "$file"); then
      : # No duplicates found
    else
      echo "❌ [$rel_path] Duplicate keys found:"
      printf '   - %s\n' $duplicates
      echo "   JSON silently overwrites duplicate keys - only the last occurrence is used!"
      exit_code=1
    fi
  done < <(find "$locales_dir" -type f -name "*.json" 2>/dev/null)

  return "$exit_code"
}

check_key_consistency() {
  local locales_dir="$REPO_ROOT/frontend/src/i18n/locales"
  local exit_code=0
  local fail_on_extra="${I18N_FAIL_ON_EXTRA:-0}"
  local verbose="${I18N_VERBOSE:-0}"

  if [ ! -d "$locales_dir/en" ]; then
    echo "❌ Missing source locale directory: $locales_dir/en"
    return 1
  fi

  # Compute namespaces from en
  local namespaces=()
  while IFS= read -r ns; do
    namespaces+=("$ns")
  done < <(find "$locales_dir/en" -maxdepth 1 -type f -name "*.json" -exec basename {} .json \; 2>/dev/null | LC_ALL=C sort)
  
  # Compute languages from locales
  local languages=()
  while IFS= read -r lang; do
    languages+=("$lang")
  done < <(find "$locales_dir" -maxdepth 1 -mindepth 1 -type d -exec basename {} \; 2>/dev/null | LC_ALL=C sort)

  # Ensure en exists
  if ! printf '%s\n' "${languages[@]}" | grep -qx "en"; then
    echo "❌ Source language 'en' not found in $locales_dir"
    return 1
  fi

  for ns in "${namespaces[@]}"; do
    local ref_file="$locales_dir/en/$ns.json"
    if ! ref_keys=$(get_json_keys "$ref_file"); then
      echo "❌ Invalid or unreadable JSON: $ref_file"
      exit_code=1
      continue
    fi

    for lang in "${languages[@]}"; do
      [ "$lang" = "en" ] && continue
      local tgt_file="$locales_dir/$lang/$ns.json"

      local tgt_keys
      local missing
      local extra
      
      if ! tgt_keys=$(get_json_keys "$tgt_file"); then
        echo "❌ [$lang/$ns] Missing or invalid JSON: $tgt_file"
        echo "   All keys from en/$ns are considered missing."
        missing="$ref_keys"
        extra=""
        exit_code=1
      else
        # Compute set differences
        missing=$(comm -23 <(printf "%s\n" "$ref_keys") <(printf "%s\n" "$tgt_keys"))
        extra=$(comm -13 <(printf "%s\n" "$ref_keys") <(printf "%s\n" "$tgt_keys"))
      fi

      if [ -n "$missing" ]; then
        echo "❌ [$lang/$ns] Missing keys:"
        if [ "$verbose" = "1" ]; then
          printf '   - %s\n' $missing
        else
          printf '   - %s\n' $(echo "$missing" | head -n 50)
          local total_missing
          total_missing=$(printf "%s\n" "$missing" | wc -l | tr -d ' ')
          if [ "$total_missing" -gt 50 ]; then
            echo "   ... and $((total_missing - 50)) more. Set I18N_VERBOSE=1 to print all."
          fi
        fi
        exit_code=1
      fi

      if [ -n "$extra" ]; then
        if [ "$fail_on_extra" = "1" ]; then
          echo "❌ [$lang/$ns] Extra keys (not in en):"
          [ "$verbose" = "1" ] && printf '   - %s\n' $extra || printf '   - %s\n' $(echo "$extra" | head -n 50)
          exit_code=1
        else
          echo "⚠️  [$lang/$ns] Extra keys (not in en):"
          [ "$verbose" = "1" ] && printf '   - %s\n' $extra || printf '   - %s\n' $(echo "$extra" | head -n 50)
        fi
      fi
    done
  done

  return "$exit_code"
}

echo "▶️  Counting literal strings in PR branch..."
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PR_COUNT=$(lint_count "$REPO_ROOT")

BASE_REF="${GITHUB_BASE_REF:-main}"
echo "▶️  Fetching $BASE_REF for baseline (shallow clone)..."
REMOTE_URL=$(git -C "$REPO_ROOT" remote get-url origin)
BASE_DIR="$(mktemp -d)"
cleanup_base() { rm -rf "$BASE_DIR"; }
trap cleanup_base EXIT

if git clone --depth=1 --branch "$BASE_REF" --single-branch "$REMOTE_URL" "$BASE_DIR" >/dev/null 2>&1; then
  BASE_COUNT=$(lint_count "$BASE_DIR")
else
  echo "⚠️  Could not clone $BASE_REF; defaulting baseline to 0."
  BASE_COUNT=0
fi

echo ""
echo "📊 I18n Violation Summary:"
echo "   Base branch ($BASE_REF): $BASE_COUNT violations"
echo "   PR branch: $PR_COUNT violations"
echo ""

EXIT_STATUS=0

if (( PR_COUNT > BASE_COUNT )); then
  echo "❌ PR introduces $((PR_COUNT - BASE_COUNT)) new hard-coded strings."
  echo ""
  echo "💡 To fix, replace hardcoded strings with translation calls:"
  echo "   Before: <Button>Save</Button>"
  echo "   After:  <Button>{t('buttons.save')}</Button>"
  echo ""
  echo "Files with new violations:"
  (cd "$REPO_ROOT/frontend" && LINT_I18N=true npx eslint . --ext ts,tsx --rule "$RULE:error" -f codeframe 2>/dev/null || true)
  EXIT_STATUS=1
elif (( PR_COUNT < BASE_COUNT )); then
  echo "🎉 Great job! PR removes $((BASE_COUNT - PR_COUNT)) hard-coded strings."
  echo "   This helps improve i18n coverage!"
else
  echo "✅ No new literal strings introduced."
fi

echo ""
echo "▶️  Checking for duplicate JSON keys..."
if ! check_duplicate_json_keys; then
  EXIT_STATUS=1
else
  echo "✅ No duplicate keys found in JSON files."
fi

echo ""
echo "▶️  Checking translation key consistency..."
if ! check_key_consistency; then
  EXIT_STATUS=1
else
  echo "✅ Translation keys are consistent across locales."
fi

exit "$EXIT_STATUS"
