#!/usr/bin/env bash
# reference-audit.sh — Prototype reference validator for HoliCode state files
# Part of HOL-301 spike: Adaptive Memory Lifecycle
#
# Scans state files for references (file paths, issue IDs, deliverable paths)
# and validates them against the current codebase and tracker state.
#
# Usage: ./scripts/reference-audit.sh [--fix] [--json]
#   --fix   Suggest corrections for stale references (does not modify files)
#   --json  Output machine-readable JSON report
#
# Portability: macOS (BSD) and Linux (GNU) compatible — no grep -P or GNU date.

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE_DIR="$ROOT_DIR/.holicode/state"
OUTPUT_FORMAT="text"
SHOW_FIXES=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --fix) SHOW_FIXES=true; shift ;;
    --json) OUTPUT_FORMAT="json"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Color codes (disabled for non-tty or JSON output)
if [[ -t 1 && "$OUTPUT_FORMAT" == "text" ]]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BLUE=''; NC=''
fi

# Counters
TOTAL_REFS=0
VALID_REFS=0
STALE_REFS=0
AMBIGUOUS_REFS=0
UNRESOLVABLE_REFS=0
CACHE_DESYNC_REFS=0

# JSON accumulators
JSON_ENTRIES=()
JSON_FILE_HEALTH=()
JSON_ZONE_FRESHNESS=()

# --- Portable date helpers ---
# Returns current date as YYYY-MM-DD
portable_today() {
  date +%Y-%m-%d
}

# Returns ISO-8601 timestamp (portable: no -Iseconds)
portable_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%S+00:00
}

# Returns epoch seconds for a YYYY-MM-DD date (works on macOS and Linux)
date_to_epoch() {
  local d="$1"
  if date -j -f "%Y-%m-%d" "$d" +%s 2>/dev/null; then
    return  # macOS BSD date
  fi
  date -d "$d" +%s 2>/dev/null || echo "0"
}

# Returns days between two YYYY-MM-DD dates
days_between() {
  local from_epoch to_epoch
  from_epoch=$(date_to_epoch "$1")
  to_epoch=$(date_to_epoch "$2")
  if [[ "$from_epoch" == "0" || "$to_epoch" == "0" ]]; then
    echo "?"
    return
  fi
  echo $(( (to_epoch - from_epoch) / 86400 ))
}

# --- Reference Type 1: File Paths ---
# Extracts backtick-quoted file paths from state files
audit_file_paths() {
  local file="$1"
  local basename
  basename="$(basename "$file")"

  # Extract backtick-quoted paths that look like files (have extensions)
  # Uses extended regex (-E) for portability instead of grep -P
  local refs
  refs=$(grep -oE '`[^`]*\.[a-zA-Z]{1,10}`' "$file" 2>/dev/null | tr -d '`' | sort -u || true)

  for ref in $refs; do
    ((TOTAL_REFS++)) || true

    # Skip if it's clearly not a file path (e.g., version strings, URLs, env vars)
    if [[ "$ref" =~ ^https?:// ]] || [[ "$ref" =~ https?:// ]] || [[ "$ref" =~ ^[0-9]+\.[0-9]+ ]] || [[ "$ref" =~ ^\$ ]] || [[ "$ref" =~ = ]]; then
      ((TOTAL_REFS--)) || true
      continue
    fi

    # Check if exact path exists (relative to repo root)
    if [[ -e "$ROOT_DIR/$ref" ]]; then
      ((VALID_REFS++)) || true
      emit_result "$basename" "file_path" "$ref" "VALID" ""
      continue
    fi

    # If it's a bare filename (no directory separator), search for it
    if [[ "$ref" != */* ]]; then
      local matches
      matches=$(find "$ROOT_DIR" -name "$ref" -not -path '*/.git/*' 2>/dev/null | head -5)
      local match_count
      if [[ -z "$matches" ]]; then
        match_count=0
      else
        match_count=$(echo "$matches" | wc -l)
      fi

      if [[ "$match_count" -eq 0 ]]; then
        ((UNRESOLVABLE_REFS++)) || true
        emit_result "$basename" "file_path" "$ref" "DELETED" "File not found anywhere in repo"
      elif [[ "$match_count" -eq 1 ]]; then
        ((AMBIGUOUS_REFS++)) || true
        local resolved
        resolved=$(echo "$matches" | sed "s|$ROOT_DIR/||")
        emit_result "$basename" "file_path" "$ref" "AMBIGUOUS" "Found at: $resolved"
      else
        ((AMBIGUOUS_REFS++)) || true
        local resolved
        resolved=$(echo "$matches" | sed "s|$ROOT_DIR/||g" | tr '\n' ', ' | sed 's/,$//')
        emit_result "$basename" "file_path" "$ref" "AMBIGUOUS" "Multiple matches: $resolved"
      fi
    else
      # Full path that doesn't exist
      ((STALE_REFS++)) || true
      # Try to find closest match
      local filename
      filename="$(basename "$ref")"
      local closest
      closest=$(find "$ROOT_DIR" -name "$filename" -not -path '*/.git/*' 2>/dev/null | head -1 | sed "s|$ROOT_DIR/||")
      if [[ -n "$closest" ]]; then
        emit_result "$basename" "file_path" "$ref" "STALE" "Moved to: $closest"
      else
        emit_result "$basename" "file_path" "$ref" "STALE" "File not found"
      fi
    fi
  done
}

# --- Reference Type 2: Deliverable Paths ---
# Extracts unquoted .holicode/ paths from state files
audit_deliverable_paths() {
  local file="$1"
  local basename
  basename="$(basename "$file")"

  # Uses extended regex for portability (no lookbehind — filter after)
  local refs
  refs=$(grep -oE '\.holicode/[a-zA-Z0-9_./-]+\.md' "$file" 2>/dev/null | sort -u || true)

  for ref in $refs; do
    ((TOTAL_REFS++)) || true

    if [[ -e "$ROOT_DIR/$ref" ]]; then
      ((VALID_REFS++)) || true
      emit_result "$basename" "deliverable" "$ref" "VALID" ""
    else
      ((STALE_REFS++)) || true
      emit_result "$basename" "deliverable" "$ref" "STALE" "Deliverable file missing"
    fi
  done
}

# --- Reference Type 3: Issue IDs (HOL-NNN) ---
# Validates issue IDs against WORK_SPEC.md (local cache).
# - If WORK_SPEC is stale (last synced > 7 days): missing IDs are CACHE_DESYNC
#   (likely valid in tracker, cache just hasn't been refreshed).
# - If WORK_SPEC is fresh (synced within 7 days): missing IDs are STALE
#   (cache is current, so the ID is genuinely unresolvable).
audit_issue_ids() {
  local file="$1"
  local basename
  basename="$(basename "$file")"

  # Extract unique HOL-NNN references (extended regex, portable)
  local refs
  refs=$(grep -oE '\bHOL-[0-9]+\b' "$file" 2>/dev/null | sort -u || true)

  # Build set of known IDs from WORK_SPEC.md
  local known_ids
  known_ids=$(grep -oE '\bHOL-[0-9]+\b' "$STATE_DIR/WORK_SPEC.md" 2>/dev/null | sort -u || true)

  # Determine if WORK_SPEC is fresh (synced within 7 days)
  local cache_fresh=false
  local last_synced
  last_synced=$(grep -oE 'Last synced: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$STATE_DIR/WORK_SPEC.md" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1 || true)
  if [[ -n "$last_synced" ]]; then
    local sync_age
    sync_age=$(days_between "$last_synced" "$(portable_today)")
    if [[ "$sync_age" != "?" && "$sync_age" -le 7 ]]; then
      cache_fresh=true
    fi
  fi

  for ref in $refs; do
    ((TOTAL_REFS++)) || true

    if echo "$known_ids" | grep -qx "$ref" 2>/dev/null; then
      ((VALID_REFS++)) || true
      # Don't emit VALID issue refs to keep output focused
    elif [[ "$cache_fresh" == "true" ]]; then
      # Cache is current — ID genuinely missing from tracker
      ((STALE_REFS++)) || true
      emit_result "$basename" "issue_id" "$ref" "STALE" "Not in WORK_SPEC.md (cache is fresh — ID may be invalid)"
    else
      # Cache is stale — ID likely exists in tracker but not synced
      ((CACHE_DESYNC_REFS++)) || true
      emit_result "$basename" "issue_id" "$ref" "CACHE_DESYNC" "Not in WORK_SPEC.md — run issue-sync to refresh cache"
    fi
  done
}

# --- Reference Type 4: Git Commit References ---
audit_git_refs() {
  local file="$1"
  local basename
  basename="$(basename "$file")"

  local refs
  refs=$(grep -oE '(commit |git )[0-9a-f]{7,40}' "$file" 2>/dev/null | grep -oE '[0-9a-f]{7,40}' | sort -u || true)

  for ref in $refs; do
    ((TOTAL_REFS++)) || true

    if git rev-parse --verify "$ref^{commit}" >/dev/null 2>&1; then
      ((VALID_REFS++)) || true
    else
      ((STALE_REFS++)) || true
      emit_result "$basename" "git_ref" "$ref" "STALE" "Commit not reachable in current branch history"
    fi
  done
}

# --- Reference Type 5: PR References ---
audit_pr_refs() {
  local file="$1"
  local basename
  basename="$(basename "$file")"

  local refs
  refs=$(grep -oE 'PR #[0-9]+' "$file" 2>/dev/null | grep -oE '[0-9]+' | sort -un || true)

  for ref in $refs; do
    ((TOTAL_REFS++)) || true
    # PRs can't be validated offline without gh CLI + network
    # Just count them as valid for now
    ((VALID_REFS++)) || true
  done
}

# --- Output Functions ---
emit_result() {
  local source_file="$1" ref_type="$2" reference="$3" status="$4" detail="$5"

  if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    # Escape any double quotes in detail for valid JSON
    local escaped_detail
    escaped_detail=$(echo "$detail" | sed 's/"/\\"/g')
    JSON_ENTRIES+=("{\"source\":\"$source_file\",\"type\":\"$ref_type\",\"ref\":\"$reference\",\"status\":\"$status\",\"detail\":\"$escaped_detail\"}")
    return
  fi

  case "$status" in
    VALID)        [[ "$SHOW_FIXES" == "true" ]] || return 0; printf "  ${GREEN}[OK]${NC} %-15s %s\n" "($ref_type)" "$reference" ;;
    STALE)        printf "  ${RED}[STALE]${NC} %-15s %s — %s\n" "($ref_type)" "$reference" "$detail" ;;
    AMBIGUOUS)    printf "  ${YELLOW}[AMBIG]${NC} %-15s %s — %s\n" "($ref_type)" "$reference" "$detail" ;;
    DELETED)      printf "  ${RED}[DEL]${NC}   %-15s %s — %s\n" "($ref_type)" "$reference" "$detail" ;;
    CACHE_DESYNC) printf "  ${BLUE}[SYNC]${NC}  %-15s %s — %s\n" "($ref_type)" "$reference" "$detail" ;;
    UNKNOWN)      printf "  ${BLUE}[???]${NC}   %-15s %s — %s\n" "($ref_type)" "$reference" "$detail" ;;
  esac
}

# --- File Size Health ---
audit_file_sizes() {
  for f in "$STATE_DIR"/*.md; do
    local name size threshold
    name="$(basename "$f")"
    size=$(wc -c < "$f")
    case "$name" in
      retro-inbox.md)     threshold=20480 ;;
      awareness-inbox.md) threshold=15360 ;;
      activeContext.md)    threshold=20480 ;;
      progress.md)        threshold=20480 ;;
      *)                  threshold=0 ;;
    esac
    if [[ $threshold -gt 0 ]]; then
      local over
      if [[ $size -gt $threshold ]]; then
        over="true"
      else
        over="false"
      fi

      if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        # Emit raw bytes for precision; consumers can format as needed
        JSON_FILE_HEALTH+=("{\"file\":\"$name\",\"size_bytes\":$size,\"threshold_bytes\":$threshold,\"over_threshold\":$over}")
      else
        # Ceiling division for display so 20481 bytes shows as 21KB, not 20KB
        local display_size display_threshold
        display_size=$(( (size + 1023) / 1024 ))
        display_threshold=$(( (threshold + 1023) / 1024 ))
        if [[ "$over" == "true" ]]; then
          printf "  ${RED}[OVER]${NC}  %-25s %dKB / %dKB threshold\n" "$name" "$display_size" "$display_threshold"
        else
          printf "  ${GREEN}[OK]${NC}    %-25s %dKB / %dKB threshold\n" "$name" "$display_size" "$display_threshold"
        fi
      fi
    fi
  done
}

# --- Append-Only Zone Freshness ---
audit_zone_freshness() {
  local today
  today=$(portable_today)

  for f in "$STATE_DIR/activeContext.md" "$STATE_DIR/progress.md"; do
    local name most_recent days_ago stale
    name="$(basename "$f")"
    # Extract dates only from append-only zone entries (lines starting with
    # "- [YYYY-MM-DD" or "-   [YYYY-MM-DD" — variable whitespace after the
    # dash), not from frontmatter/generated sections which can mask stale
    # append-only zones with metadata timestamps.
    most_recent=$(grep -E '^\-\s+\[[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f" 2>/dev/null \
      | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort -r | head -1 || echo "unknown")
    if [[ "$most_recent" != "unknown" ]]; then
      days_ago=$(days_between "$most_recent" "$today")
      if [[ "$days_ago" != "?" && "$days_ago" -gt 14 ]]; then
        stale="true"
      else
        stale="false"
      fi

      if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        JSON_ZONE_FRESHNESS+=("{\"file\":\"$name\",\"last_entry\":\"$most_recent\",\"days_ago\":\"$days_ago\",\"stale\":$stale}")
      else
        if [[ "$stale" == "true" ]]; then
          printf "  ${YELLOW}[STALE]${NC} %-25s Last entry: %s (%s days ago)\n" "$name" "$most_recent" "$days_ago"
        else
          printf "  ${GREEN}[OK]${NC}    %-25s Last entry: %s (%s days ago)\n" "$name" "$most_recent" "$days_ago"
        fi
      fi
    fi
  done
}

# --- Main ---
main() {
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo "============================================"
    echo "  HoliCode Reference Audit"
    echo "  $(portable_timestamp)"
    echo "============================================"
    echo ""
  fi

  # Audit each state file (including inboxes — broken references in the
  # oversized retro-inbox are a primary maintenance concern per HOL-301)
  for state_file in "$STATE_DIR/activeContext.md" "$STATE_DIR/progress.md" "$STATE_DIR/WORK_SPEC.md" "$STATE_DIR/retro-inbox.md" "$STATE_DIR/awareness-inbox.md"; do
    if [[ ! -f "$state_file" ]]; then continue; fi
    local name
    name="$(basename "$state_file")"

    if [[ "$OUTPUT_FORMAT" == "text" ]]; then
      echo "=== $name ==="
    fi

    audit_file_paths "$state_file"
    audit_deliverable_paths "$state_file"
    audit_issue_ids "$state_file"
    audit_git_refs "$state_file"
    audit_pr_refs "$state_file"

    if [[ "$OUTPUT_FORMAT" == "text" ]]; then
      echo ""
    fi
  done

  # File sizes and zone freshness (emitted in both text and JSON modes)
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo ""
    echo "=== State File Health ==="
  fi
  audit_file_sizes

  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo ""
    echo "=== Append-Only Zone Freshness ==="
  fi
  audit_zone_freshness

  # Health score: cache-desync refs are excluded from the penalty
  # (they indicate a sync problem, not a reference problem)
  local scoreable_total=$((TOTAL_REFS - CACHE_DESYNC_REFS))
  local health_pct=100
  if [[ $scoreable_total -gt 0 ]]; then
    health_pct=$(( (VALID_REFS * 100) / scoreable_total ))
  fi

  # Summary
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo ""
    echo "=== Summary ==="
    echo "  Total references:   $TOTAL_REFS"
    echo "  Valid:              $VALID_REFS"
    echo "  Stale/Missing:     $STALE_REFS"
    echo "  Ambiguous:         $AMBIGUOUS_REFS"
    echo "  Deleted:           $UNRESOLVABLE_REFS"
    echo "  Cache desync:      $CACHE_DESYNC_REFS (not counted in health score — run issue-sync)"
    echo "  Health score:      ${health_pct}% (of $scoreable_total scoreable refs)"
    echo ""
    if [[ $((STALE_REFS + AMBIGUOUS_REFS + UNRESOLVABLE_REFS)) -gt 0 ]]; then
      echo "  Recommendation: Run state-maintain to resolve stale references"
    fi
    if [[ $CACHE_DESYNC_REFS -gt 0 ]]; then
      echo "  Recommendation: Run issue-sync to refresh WORK_SPEC.md ($CACHE_DESYNC_REFS unsynced IDs)"
    fi
    if [[ $((STALE_REFS + AMBIGUOUS_REFS + UNRESOLVABLE_REFS + CACHE_DESYNC_REFS)) -eq 0 ]]; then
      echo "  All references valid."
    fi
  elif [[ "$OUTPUT_FORMAT" == "json" ]]; then
    # Build JSON arrays from accumulators
    local findings_json="[]"
    if [[ ${#JSON_ENTRIES[@]} -gt 0 ]]; then
      findings_json="[$(printf '%s\n' "${JSON_ENTRIES[@]}" | paste -sd, -)]"
    fi

    local file_health_json="[]"
    if [[ ${#JSON_FILE_HEALTH[@]} -gt 0 ]]; then
      file_health_json="[$(printf '%s\n' "${JSON_FILE_HEALTH[@]}" | paste -sd, -)]"
    fi

    local zone_freshness_json="[]"
    if [[ ${#JSON_ZONE_FRESHNESS[@]} -gt 0 ]]; then
      zone_freshness_json="[$(printf '%s\n' "${JSON_ZONE_FRESHNESS[@]}" | paste -sd, -)]"
    fi

    printf '{"timestamp":"%s","total":%d,"valid":%d,"stale":%d,"ambiguous":%d,"deleted":%d,"cache_desync":%d,"health_pct":%d,"scoreable_total":%d,"findings":%s,"file_health":%s,"zone_freshness":%s}\n' \
      "$(portable_timestamp)" \
      "$TOTAL_REFS" "$VALID_REFS" "$STALE_REFS" "$AMBIGUOUS_REFS" "$UNRESOLVABLE_REFS" \
      "$CACHE_DESYNC_REFS" "$health_pct" "$scoreable_total" \
      "$findings_json" "$file_health_json" "$zone_freshness_json"
  fi
}

main "$@"
