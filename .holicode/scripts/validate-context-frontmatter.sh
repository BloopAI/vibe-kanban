#!/usr/bin/env bash
# validate-context-frontmatter.sh — Validate .index/ front matter schema
# Usage: bash .holicode/scripts/validate-context-frontmatter.sh <path-to-.index-dir>
#
# Filename kept as validate-context-frontmatter.sh for historical reasons
# (HOL-389). Script content targets .index/ post-HOL-508 rename. File rename
# is tracked as a possible follow-up.
#
# Checks:
#   1. Required fields present per file type
#   2. Enum values within allowed sets
#   3. last_analyzed is a valid ISO 8601 date
#   4. Aspect names in overview.md index match actual aspect files
#   5. Aspect file 'aspect' field matches its filename
#
# Exit codes: 0 = all valid, 1 = validation errors found

set -euo pipefail

# --- Configuration ---
VALID_CONFIDENCE="scaffold partial complete verified"
VALID_ANALYSIS_SCOPE="full incremental targeted"
VALID_ASPECT_STATUS="not-analyzed draft reviewed verified"
VALID_RELEVANCE="high medium low not-applicable"
DATE_REGEX='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

errors=0
warnings=0

# --- Helpers ---
err() { echo "  ERROR: $1"; errors=$((errors + 1)); }
warn() { echo "  WARN:  $1"; warnings=$((warnings + 1)); }
info() { echo "  OK:    $1"; }

# Extract a YAML front matter value (simple single-line values only)
fm_value() {
  local file="$1" key="$2"
  sed -n '/^---$/,/^---$/p' "$file" | grep -E "^${key}:" | head -1 | sed "s/^${key}:[[:space:]]*//"
}

# Check if value is in a space-separated allowed set
in_set() {
  local val="$1" set="$2"
  for item in $set; do
    [[ "$val" == "$item" ]] && return 0
  done
  return 1
}

# Validate common fields (confidence, last_analyzed)
validate_common() {
  local file="$1" label="$2"

  local confidence
  confidence=$(fm_value "$file" "confidence")
  if [[ -z "$confidence" ]]; then
    err "$label: missing required field 'confidence'"
  elif ! in_set "$confidence" "$VALID_CONFIDENCE"; then
    err "$label: invalid confidence '$confidence' (allowed: $VALID_CONFIDENCE)"
  fi

  local last_analyzed
  last_analyzed=$(fm_value "$file" "last_analyzed")
  if [[ -z "$last_analyzed" ]]; then
    err "$label: missing required field 'last_analyzed'"
  elif ! [[ "$last_analyzed" =~ $DATE_REGEX ]]; then
    err "$label: invalid last_analyzed '$last_analyzed' (expected YYYY-MM-DD)"
  fi
}

# Validate aspect file fields (aspect, status, relevance, last_analyzed)
validate_aspect() {
  local file="$1" label="$2" expected_name="$3"

  local aspect
  aspect=$(fm_value "$file" "aspect")
  if [[ -z "$aspect" ]]; then
    err "$label: missing required field 'aspect'"
  elif [[ "$aspect" != "$expected_name" ]]; then
    err "$label: aspect field '$aspect' does not match filename '$expected_name'"
  fi

  local status
  status=$(fm_value "$file" "status")
  if [[ -z "$status" ]]; then
    err "$label: missing required field 'status'"
  elif ! in_set "$status" "$VALID_ASPECT_STATUS"; then
    err "$label: invalid status '$status' (allowed: $VALID_ASPECT_STATUS)"
  fi

  local relevance
  relevance=$(fm_value "$file" "relevance")
  if [[ -z "$relevance" ]]; then
    err "$label: missing required field 'relevance'"
  elif ! in_set "$relevance" "$VALID_RELEVANCE"; then
    err "$label: invalid relevance '$relevance' (allowed: $VALID_RELEVANCE)"
  fi

  local last_analyzed
  last_analyzed=$(fm_value "$file" "last_analyzed")
  if [[ -z "$last_analyzed" ]]; then
    err "$label: missing required field 'last_analyzed'"
  elif ! [[ "$last_analyzed" =~ $DATE_REGEX ]]; then
    err "$label: invalid last_analyzed '$last_analyzed' (expected YYYY-MM-DD)"
  fi
}

# --- Main ---
INDEX_DIR="${1:-.index}"

if [[ ! -d "$INDEX_DIR" ]]; then
  echo "ERROR: Directory not found: $INDEX_DIR"
  echo "Usage: $0 <path-to-.index-dir>"
  exit 1
fi

echo "Validating .index/ front matter in: $INDEX_DIR"
echo "============================================"

# --- overview.md ---
if [[ -f "$INDEX_DIR/overview.md" ]]; then
  echo ""
  echo "[overview.md]"
  validate_common "$INDEX_DIR/overview.md" "overview.md"

  scope=$(fm_value "$INDEX_DIR/overview.md" "analysis_scope")
  if [[ -z "$scope" ]]; then
    err "overview.md: missing required field 'analysis_scope'"
  elif ! in_set "$scope" "$VALID_ANALYSIS_SCOPE"; then
    err "overview.md: invalid analysis_scope '$scope' (allowed: $VALID_ANALYSIS_SCOPE)"
  fi

  # Cross-check aspects index against actual files
  if [[ -d "$INDEX_DIR/aspects" ]]; then
    # Extract aspect names from YAML list (simple grep for '- name:' lines)
    indexed_aspects=$(sed -n '/^---$/,/^---$/p' "$INDEX_DIR/overview.md" \
      | grep -E '^\s+-\s+name:' | sed 's/.*name:[[:space:]]*//' | sort)

    actual_aspects=$(find "$INDEX_DIR/aspects" -maxdepth 1 -name '*.md' -exec basename {} .md \; | sort)

    for indexed in $indexed_aspects; do
      if ! echo "$actual_aspects" | grep -qx "$indexed"; then
        warn "overview.md: aspect '$indexed' indexed but no file at aspects/${indexed}.md"
      fi
    done

    for actual in $actual_aspects; do
      if ! echo "$indexed_aspects" | grep -qx "$actual"; then
        warn "overview.md: aspect file aspects/${actual}.md exists but not in aspects[] index"
      fi
    done
  fi
  info "overview.md checked"
else
  warn "overview.md not found (recommended)"
fi

# --- dependencies.md ---
if [[ -f "$INDEX_DIR/dependencies.md" ]]; then
  echo ""
  echo "[dependencies.md]"
  validate_common "$INDEX_DIR/dependencies.md" "dependencies.md"
  info "dependencies.md checked"
fi

# --- domain-model.md ---
if [[ -f "$INDEX_DIR/domain-model.md" ]]; then
  echo ""
  echo "[domain-model.md]"
  validate_common "$INDEX_DIR/domain-model.md" "domain-model.md"
  info "domain-model.md checked"
fi

# --- aspects/*.md ---
if [[ -d "$INDEX_DIR/aspects" ]]; then
  echo ""
  echo "[aspects/]"
  for aspect_file in "$INDEX_DIR/aspects"/*.md; do
    [[ -f "$aspect_file" ]] || continue
    basename_noext=$(basename "$aspect_file" .md)
    validate_aspect "$aspect_file" "aspects/${basename_noext}.md" "$basename_noext"
    info "aspects/${basename_noext}.md checked"
  done
fi

# --- Summary ---
echo ""
echo "============================================"
echo "Validation complete: $errors error(s), $warnings warning(s)"

if [[ $errors -gt 0 ]]; then
  exit 1
fi
exit 0
