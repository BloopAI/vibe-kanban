#!/usr/bin/env bash
#
# scripts/package.sh
#
# Produce a versioned distribution archive: holicode-vX.Y.Z.tar.gz
# Contains only the files needed to install/update the framework in a target project.
#
# Usage:
#   ./scripts/package.sh                 # auto-detect version from holicode.md
#   ./scripts/package.sh --version 0.4.0 # explicit version override
#   ./scripts/package.sh --dry-run       # list contents without producing archive
#
# Version source of truth (priority order):
#   1. --version CLI flag (explicit override)
#   2. holicode.md frontmatter line 1: "# HoliCode Framework vX.Y.Z"
#   3. package.json "version" field
#
# Output: dist/holicode-vX.Y.Z.tar.gz + dist/holicode-vX.Y.Z.manifest

set -Eeuo pipefail

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/dist"
DRY_RUN=0
EXPLICIT_VERSION=""
INCLUDE_INFRA=0

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v) EXPLICIT_VERSION="$2"; shift 2 ;;
    --dry-run|-n) DRY_RUN=1; shift ;;
    --include-infra) INCLUDE_INFRA=1; shift ;;
    --help|-h)
      echo "Usage: $0 [--version X.Y.Z] [--dry-run] [--include-infra]"
      echo ""
      echo "Options:"
      echo "  --version, -v   Explicit version (overrides auto-detect)"
      echo "  --dry-run, -n   List contents without producing archive"
      echo "  --include-infra Include scripts/infra/ in archive (large)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Version detection ---
detect_version() {
  # Priority 1: CLI flag
  if [[ -n "$EXPLICIT_VERSION" ]]; then
    echo "$EXPLICIT_VERSION"
    return
  fi

  # Priority 2: holicode.md header line
  if [[ -f "holicode.md" ]]; then
    local header_version
    header_version=$(head -1 holicode.md | sed -n 's/^# HoliCode Framework v\([0-9][0-9.]*\).*/\1/p')
    if [[ -n "$header_version" ]]; then
      echo "$header_version"
      return
    fi
  fi

  # Priority 3: package.json
  if [[ -f "package.json" ]]; then
    local pkg_version
    pkg_version=$(grep '"version"' package.json | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    if [[ -n "$pkg_version" ]]; then
      echo "$pkg_version"
      return
    fi
  fi

  echo ""
}

VERSION=$(detect_version)
if [[ -z "$VERSION" ]]; then
  echo "ERROR: Could not detect version. Use --version X.Y.Z" >&2
  exit 1
fi

ARCHIVE_NAME="holicode-v${VERSION}"
echo "=== HoliCode Distribution Packager ==="
echo "Version:  v${VERSION}"
echo "Archive:  ${ARCHIVE_NAME}.tar.gz"
echo ""

# --- Define distribution manifest ---
# These are the files/dirs that constitute a distributable HoliCode framework.
# Each entry: <source-path>:<archive-path> (relative to repo root)
# Directories end with /

MANIFEST_ENTRIES=()

# Core framework rules (the brain)
MANIFEST_ENTRIES+=("holicode.md:holicode.md")

# Skills (reusable AI capabilities)
add_dir() {
  local src="$1"
  local dest="${2:-$1}"
  if [[ -d "$src" ]]; then
    while IFS= read -r -d '' file; do
      local rel="${file#./}"
      local dest_path="${dest}${rel#$src}"
      MANIFEST_ENTRIES+=("$rel:$dest_path")
    done < <(find "$src" -type f -print0 | sort -z)
  fi
}

add_dir "skills/" "skills/"
add_dir "workflows/" "workflows/"
add_dir "config/" "config/"
add_dir "agent-boot/" "agent-boot/"
add_dir "templates/" "templates/"
add_dir "specs/" "specs/"

# Distribution scripts (update, package, install)
for script in scripts/update.sh scripts/package.sh scripts/version-diff.sh scripts/validate-context-frontmatter.sh scripts/install-user-framework.sh scripts/integrate-project.sh; do
  if [[ -f "$script" ]]; then
    MANIFEST_ENTRIES+=("$script:$script")
  fi
done

# Script libraries (needed by distribution scripts)
add_dir "scripts/lib/" "scripts/lib/"

# Git/PR helper scripts
add_dir "scripts/git/" "scripts/git/"
add_dir "scripts/pr/" "scripts/pr/"
add_dir "scripts/release/" "scripts/release/"

# CHANGELOG (for migration version awareness)
if [[ -f "CHANGELOG.md" ]]; then
  MANIFEST_ENTRIES+=("CHANGELOG.md:CHANGELOG.md")
fi

# Optional: infrastructure scripts (large, usually not needed for framework consumers)
if [[ "$INCLUDE_INFRA" -eq 1 ]]; then
  add_dir "scripts/infra/" "scripts/infra/"
  add_dir "scripts/ci/" "scripts/ci/"
fi

# --- Generate manifest file ---
echo "Contents (${#MANIFEST_ENTRIES[@]} files):"
echo "---"

MANIFEST_TEXT=""
TOTAL_SIZE=0
for entry in "${MANIFEST_ENTRIES[@]}"; do
  src="${entry%%:*}"
  dest="${entry#*:}"
  if [[ -f "$src" ]]; then
    size=$(wc -c < "$src" | tr -d ' ')
    TOTAL_SIZE=$((TOTAL_SIZE + size))
    line="$dest ($size bytes)"
    MANIFEST_TEXT+="$line"$'\n'
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "  $line"
    fi
  fi
done

TOTAL_KB=$((TOTAL_SIZE / 1024))
echo "---"
echo "Total: ${#MANIFEST_ENTRIES[@]} files, ~${TOTAL_KB} KB uncompressed"
echo ""

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(dry-run mode - no archive produced)"
  exit 0
fi

# --- Build archive ---
mkdir -p "$DIST_DIR"

# Create a temp directory for staging
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT

STAGE_ROOT="$STAGING_DIR/$ARCHIVE_NAME"
mkdir -p "$STAGE_ROOT"

for entry in "${MANIFEST_ENTRIES[@]}"; do
  src="${entry%%:*}"
  dest="${entry#*:}"
  if [[ -f "$src" ]]; then
    mkdir -p "$STAGE_ROOT/$(dirname "$dest")"
    cp "$src" "$STAGE_ROOT/$dest"
  fi
done

# Write manifest into the archive
echo "# HoliCode v${VERSION} Distribution Manifest" > "$STAGE_ROOT/MANIFEST"
echo "# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$STAGE_ROOT/MANIFEST"
echo "# Files: ${#MANIFEST_ENTRIES[@]}" >> "$STAGE_ROOT/MANIFEST"
echo "# Size: ~${TOTAL_KB} KB uncompressed" >> "$STAGE_ROOT/MANIFEST"
echo "" >> "$STAGE_ROOT/MANIFEST"
echo "$MANIFEST_TEXT" >> "$STAGE_ROOT/MANIFEST"

# Write version file (machine-readable)
cat > "$STAGE_ROOT/VERSION" << EOF
${VERSION}
EOF

# Create the archive
ARCHIVE_PATH="$DIST_DIR/${ARCHIVE_NAME}.tar.gz"
tar -czf "$ARCHIVE_PATH" -C "$STAGING_DIR" "$ARCHIVE_NAME"

# Write manifest alongside archive
cp "$STAGE_ROOT/MANIFEST" "$DIST_DIR/${ARCHIVE_NAME}.manifest"

ARCHIVE_SIZE=$(wc -c < "$ARCHIVE_PATH" | tr -d ' ')
ARCHIVE_KB=$((ARCHIVE_SIZE / 1024))

echo "Archive produced:"
echo "  $ARCHIVE_PATH ($ARCHIVE_KB KB compressed)"
echo "  $DIST_DIR/${ARCHIVE_NAME}.manifest"
echo ""
echo "Install to a project:"
echo "  tar xzf ${ARCHIVE_NAME}.tar.gz"
echo "  cd /path/to/target/project && bash /path/to/${ARCHIVE_NAME}/scripts/update.sh /path/to/${ARCHIVE_NAME}"
