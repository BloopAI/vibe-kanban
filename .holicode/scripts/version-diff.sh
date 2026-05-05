#!/usr/bin/env bash
#
# scripts/version-diff.sh
#
# Generate a structured diff between two HoliCode framework versions.
# Produces a machine-readable MIGRATION-GUIDE.md that holicode-migrate can consume.
#
# Usage:
#   ./scripts/version-diff.sh v0.3.0 v0.4.0           # compare two tags
#   ./scripts/version-diff.sh v0.3.0 HEAD              # compare tag to current
#   ./scripts/version-diff.sh --from-archive old.tar.gz # compare against archive manifest (STUB — not yet implemented)
#
# Output: dist/MIGRATION-GUIDE-vOLD-to-vNEW.md
#
# This script bridges the gap between package.sh (produces archives) and
# holicode-migrate (consumes migration guidance). It answers: "what changed
# between version A and version B?"

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/dist"

# --- Argument parsing ---
FROM_REF=""
TO_REF=""
FROM_ARCHIVE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-archive) FROM_ARCHIVE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 <from-ref> <to-ref>"
      echo "       $0 --from-archive <old.tar.gz> [to-ref]"
      echo ""
      echo "Generates MIGRATION-GUIDE.md showing what changed between versions."
      exit 0
      ;;
    *)
      if [[ -z "$FROM_REF" ]]; then
        FROM_REF="$1"
      elif [[ -z "$TO_REF" ]]; then
        TO_REF="$1"
      else
        echo "ERROR: Too many arguments" >&2; exit 1
      fi
      shift
      ;;
  esac
done

# Default TO_REF to HEAD
TO_REF="${TO_REF:-HEAD}"

# --- Distribution-relevant paths ---
# Only track paths that go into the distribution archive
DIST_PATHS=(
  "skills/"
  "workflows/"
  "config/"
  "agent-boot/"
  "templates/"
  "specs/"
  "holicode.md"
  "scripts/update.sh"
  "scripts/package.sh"
  "scripts/version-diff.sh"
  "scripts/lib/"
)

# --- Version extraction ---
extract_version_from_ref() {
  local ref="$1"
  # Try to read holicode.md at that ref
  local header
  header=$(git show "${ref}:holicode.md" 2>/dev/null | head -1) || true
  local ver
  ver=$(echo "$header" | sed -n 's/^# HoliCode Framework v\([0-9][0-9.]*\).*/\1/p')
  if [[ -n "$ver" ]]; then
    echo "$ver"
  else
    echo "$ref"
  fi
}

# --- Diff generation (git-based) ---
generate_git_diff() {
  local from="$1"
  local to="$2"

  local from_version
  from_version=$(extract_version_from_ref "$from")
  local to_version
  to_version=$(extract_version_from_ref "$to")

  echo "Comparing: v${from_version} ($from) → v${to_version} ($to)"
  echo ""

  mkdir -p "$DIST_DIR"
  local output_file="$DIST_DIR/MIGRATION-GUIDE-v${from_version}-to-v${to_version}.md"

  # Build path filter for git diff
  local path_args=()
  for p in "${DIST_PATHS[@]}"; do
    path_args+=("$p")
  done

  # Collect changes
  local added_files=()
  local modified_files=()
  local deleted_files=()
  local renamed_files=()

  while IFS=$'\t' read -r status file rest; do
    case "$status" in
      A)  added_files+=("$file") ;;
      M)  modified_files+=("$file") ;;
      D)  deleted_files+=("$file") ;;
      R*) renamed_files+=("$file → $rest") ;;
    esac
  done < <(git diff --name-status "${from}..${to}" -- "${path_args[@]}" 2>/dev/null || true)

  # Categorize by component
  local added_skills=() modified_skills=() deleted_skills=()
  local added_workflows=() modified_workflows=() deleted_workflows=()
  local added_config=() modified_config=() deleted_config=()
  local added_templates=() modified_templates=() deleted_templates=()
  local other_changes=()
  local core_changed=0

  categorize() {
    local file="$1"
    local target_var="$2"  # "added", "modified", "deleted"

    case "$file" in
      skills/*)
        local skill_name
        skill_name=$(echo "$file" | cut -d'/' -f2)
        eval "${target_var}_skills+=(\"$skill_name\")"
        ;;
      workflows/*)
        local wf_name="${file#workflows/}"
        eval "${target_var}_workflows+=(\"${wf_name%.md}\")"
        ;;
      config/*)   eval "${target_var}_config+=(\"$file\")" ;;
      templates/*) eval "${target_var}_templates+=(\"$file\")" ;;
      specs/*)     eval "${target_var}_templates+=(\"$file\")" ;;
      holicode.md) core_changed=1 ;;
      *)          other_changes+=("$file ($target_var)") ;;
    esac
  }

  for f in "${added_files[@]+"${added_files[@]}"}"; do categorize "$f" "added"; done
  for f in "${modified_files[@]+"${modified_files[@]}"}"; do categorize "$f" "modified"; done
  for f in "${deleted_files[@]+"${deleted_files[@]}"}"; do categorize "$f" "deleted"; done

  # Deduplicate skill names (multiple files in same skill dir)
  dedup() {
    printf '%s\n' "$@" | sort -u
  }

  added_skills=($(dedup "${added_skills[@]+"${added_skills[@]}"}"))
  modified_skills=($(dedup "${modified_skills[@]+"${modified_skills[@]}"}"))
  deleted_skills=($(dedup "${deleted_skills[@]+"${deleted_skills[@]}"}"))
  added_workflows=($(dedup "${added_workflows[@]+"${added_workflows[@]}"}"))
  modified_workflows=($(dedup "${modified_workflows[@]+"${modified_workflows[@]}"}"))
  deleted_workflows=($(dedup "${deleted_workflows[@]+"${deleted_workflows[@]}"}"))

  # Detect breaking changes from commit messages
  local breaking_changes=()
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      breaking_changes+=("$line")
    fi
  done < <(git log "${from}..${to}" --grep="BREAKING CHANGE" --pretty=format:"%s" -- "${path_args[@]}" 2>/dev/null || true)

  # Collect conventional commit summaries
  local feat_commits=()
  local fix_commits=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && feat_commits+=("$line")
  done < <(git log "${from}..${to}" --grep="^feat" --pretty=format:"- %s (%h)" -- "${path_args[@]}" 2>/dev/null || true)
  while IFS= read -r line; do
    [[ -n "$line" ]] && fix_commits+=("$line")
  done < <(git log "${from}..${to}" --grep="^fix" --pretty=format:"- %s (%h)" -- "${path_args[@]}" 2>/dev/null || true)

  # --- Render migration guide ---
  cat > "$output_file" << HEADER
# Migration Guide: v${from_version} → v${to_version}

Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
From: ${from} (v${from_version})
To: ${to} (v${to_version})

## Summary

| Category | Added | Modified | Removed |
|----------|-------|----------|---------|
| Skills | ${#added_skills[@]} | ${#modified_skills[@]} | ${#deleted_skills[@]} |
| Workflows | ${#added_workflows[@]} | ${#modified_workflows[@]} | ${#deleted_workflows[@]} |
| Config | ${#added_config[@]} | ${#modified_config[@]} | ${#deleted_config[@]} |
| Templates | ${#added_templates[@]} | ${#modified_templates[@]} | ${#deleted_templates[@]} |
| Core (holicode.md) | - | ${core_changed} | - |

HEADER

  # Breaking changes section
  if [[ ${#breaking_changes[@]} -gt 0 ]]; then
    echo "## Breaking Changes" >> "$output_file"
    echo "" >> "$output_file"
    for bc in "${breaking_changes[@]}"; do
      echo "- $bc" >> "$output_file"
    done
    echo "" >> "$output_file"
  fi

  # Added section
  if [[ ${#added_skills[@]} -gt 0 || ${#added_workflows[@]} -gt 0 || ${#added_config[@]} -gt 0 ]]; then
    echo "## Added" >> "$output_file"
    echo "" >> "$output_file"
    if [[ ${#added_skills[@]} -gt 0 ]]; then
      echo "### New Skills" >> "$output_file"
      for s in "${added_skills[@]}"; do echo "- \`$s\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
    if [[ ${#added_workflows[@]} -gt 0 ]]; then
      echo "### New Workflows" >> "$output_file"
      for w in "${added_workflows[@]}"; do echo "- \`$w\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
    if [[ ${#added_config[@]} -gt 0 ]]; then
      echo "### New Config" >> "$output_file"
      for c in "${added_config[@]}"; do echo "- \`$c\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
  fi

  # Modified section
  if [[ ${#modified_skills[@]} -gt 0 || ${#modified_workflows[@]} -gt 0 || $core_changed -eq 1 ]]; then
    echo "## Changed" >> "$output_file"
    echo "" >> "$output_file"
    if [[ $core_changed -eq 1 ]]; then
      echo "### Core Framework" >> "$output_file"
      echo "- \`holicode.md\` updated (review for new conventions or workflow changes)" >> "$output_file"
      echo "" >> "$output_file"
    fi
    if [[ ${#modified_skills[@]} -gt 0 ]]; then
      echo "### Updated Skills" >> "$output_file"
      for s in "${modified_skills[@]}"; do echo "- \`$s\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
    if [[ ${#modified_workflows[@]} -gt 0 ]]; then
      echo "### Updated Workflows" >> "$output_file"
      for w in "${modified_workflows[@]}"; do echo "- \`$w\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
  fi

  # Removed section
  if [[ ${#deleted_skills[@]} -gt 0 || ${#deleted_workflows[@]} -gt 0 ]]; then
    echo "## Removed" >> "$output_file"
    echo "" >> "$output_file"
    echo "**Manual Action Required**: Remove these from your project if present." >> "$output_file"
    echo "" >> "$output_file"
    if [[ ${#deleted_skills[@]} -gt 0 ]]; then
      echo "### Removed Skills" >> "$output_file"
      for s in "${deleted_skills[@]}"; do echo "- \`$s\` — remove from \`.clinerules/skills/\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
    if [[ ${#deleted_workflows[@]} -gt 0 ]]; then
      echo "### Removed Workflows" >> "$output_file"
      for w in "${deleted_workflows[@]}"; do echo "- \`$w\` — remove from \`.clinerules/workflows/\`" >> "$output_file"; done
      echo "" >> "$output_file"
    fi
  fi

  # New concepts / hydration section
  if [[ ${#added_templates[@]} -gt 0 ]]; then
    echo "## New Concepts (Hydration Candidates)" >> "$output_file"
    echo "" >> "$output_file"
    echo "These new templates may introduce concepts that benefit from interactive setup:" >> "$output_file"
    echo "" >> "$output_file"
    for t in "${added_templates[@]}"; do echo "- \`$t\`" >> "$output_file"; done
    echo "" >> "$output_file"
    echo "Review these templates and manually scaffold as needed. (Interactive \`holicode-hydrate\` skill planned — see HOL-394.)" >> "$output_file"
    echo "" >> "$output_file"
  fi

  # Commit log section
  if [[ ${#feat_commits[@]} -gt 0 || ${#fix_commits[@]} -gt 0 ]]; then
    echo "## Changelog" >> "$output_file"
    echo "" >> "$output_file"
    if [[ ${#feat_commits[@]} -gt 0 ]]; then
      echo "### Features" >> "$output_file"
      printf '%s\n' "${feat_commits[@]}" >> "$output_file"
      echo "" >> "$output_file"
    fi
    if [[ ${#fix_commits[@]} -gt 0 ]]; then
      echo "### Fixes" >> "$output_file"
      printf '%s\n' "${fix_commits[@]}" >> "$output_file"
      echo "" >> "$output_file"
    fi
  fi

  # Migration steps
  cat >> "$output_file" << 'STEPS'
## Migration Steps

1. **Extract archive**: `tar xzf holicode-vNEW.tar.gz`
2. **Run update**: `cd /path/to/your/project && bash /path/to/holicode-vNEW/scripts/update.sh /path/to/holicode-vNEW`
3. **Run migration**: In your project, invoke the `holicode-migrate` skill with this guide as input
4. **Review breaking changes**: Address any items in the "Breaking Changes" section above
5. **Adopt new concepts**: Review new templates and scaffold as needed (interactive `holicode-hydrate` skill planned — see HOL-394)
6. **Verify**: Run your project's test suite and check agent discovery (`ls -la .claude/skills/`)
STEPS

  echo ""
  echo "Migration guide written to: $output_file"
  echo ""
  echo "Stats:"
  echo "  Skills:    +${#added_skills[@]} ~${#modified_skills[@]} -${#deleted_skills[@]}"
  echo "  Workflows: +${#added_workflows[@]} ~${#modified_workflows[@]} -${#deleted_workflows[@]}"
  echo "  Breaking:  ${#breaking_changes[@]} changes"
}

# --- Main ---
if [[ -n "$FROM_ARCHIVE" ]]; then
  echo "Archive-based diff not yet implemented."
  echo "Use git ref comparison: $0 <from-tag> <to-tag>"
  exit 1
fi

if [[ -z "$FROM_REF" ]]; then
  echo "ERROR: Must provide a from-ref (tag or commit)." >&2
  echo "Usage: $0 <from-ref> [to-ref]" >&2
  exit 1
fi

generate_git_diff "$FROM_REF" "$TO_REF"
