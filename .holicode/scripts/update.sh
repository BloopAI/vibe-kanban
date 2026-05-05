#!/bin/bash

# update.sh
#
# A script to sync workflows, skills, templates, config, and helper scripts from the
# central HoliCode framework repository into the current project's structure.
#
# Workflows (agents) are synced to .github/agents/ — the canonical path for all agents.
# Skills are synced to .github/skills/ — the canonical path for all agents.
# Other agents (Claude, OpenCode, Gemini, Qwen) discover them via symlinks.
# Copilot reads .github/ natively (no symlinks needed).
# Templates and helper scripts are synced to .holicode/ for project context.
# Existing .holicode/state/WORK_SPEC.md is preserved when present.
#
# Self-sync (holicode framework repo): ./scripts/update.sh .
# This populates .github/agents/ and .github/skills/ from workflows/ and skills/.

# --- Configuration ---
# The name of the directory for contextual/data parts of the framework.
HOLICODE_DATA_DIR=".holicode"
# Manifest tracking which files were synced from the framework.
# Used to distinguish stale framework files from project-owned additions.
MANIFEST_FILE="$HOLICODE_DATA_DIR/.framework-manifest"
# Canonical paths for agents and skills (Copilot reads these directly).
AGENTS_TARGET_DIR=".github/agents"
SKILLS_TARGET_DIR=".github/skills"
# The name of the directory for framework-level config.
CONFIG_TARGET_DIR=".clinerules/config"
# Symlink targets (relative from agent-specific dirs to canonical paths).
AGENTS_LINK_TARGET="../.github/agents"
SKILLS_LINK_TARGET="../.github/skills"
# Agent discovery symlink paths for agents (workflows).
AGENTS_LINK_PATHS=(
  ".claude/agents"
  ".opencode/agents"
  ".gemini/agents"
  ".qwen/agents"
)
# Agent skill discovery symlink paths.
SKILLS_LINK_PATHS=(
  ".claude/skills"
  ".agents/skills"
  ".opencode/skills"
  ".gemini/skills"
  ".qwen/skills"
)

# --- Pre-flight Checks ---

# Check for required dependencies
if ! command -v rsync >/dev/null 2>&1; then
  echo "❌ ERROR: rsync is required but not found. Please install rsync."
  exit 1
fi

# Check if a source path was provided
if [ -z "$1" ]; then
  echo "❌ ERROR: You must provide the path to your source HoliCode framework repository."
  echo "   Usage: ./scripts/update.sh /path/to/your/holicode-framework-repo"
  exit 1
fi

FRAMEWORK_SOURCE_PATH=$1

# Check if the source directory exists
if [ ! -d "$FRAMEWORK_SOURCE_PATH" ]; then
  echo "❌ ERROR: Source directory not found at '$FRAMEWORK_SOURCE_PATH'"
  exit 1
fi

# --- Backward Compatibility: Migrate from .clinerules/ layout ---

if [ -d ".clinerules/workflows" ] && [ ! -L ".clinerules/workflows" ]; then
  echo "\n⚠️  Detected legacy layout: .clinerules/workflows/ contains real files."
  echo "   Migrating to .github/agents/ (new canonical path)..."
  mkdir -p "$AGENTS_TARGET_DIR"
  rsync -av --delete ".clinerules/workflows/" "$AGENTS_TARGET_DIR/"
  rm -rf ".clinerules/workflows"
  echo "   Migration complete. .clinerules/workflows/ removed."
fi

if [ -d ".clinerules/skills" ] && [ ! -L ".clinerules/skills" ]; then
  echo "\n⚠️  Detected legacy layout: .clinerules/skills/ contains real files."
  echo "   Migrating to .github/skills/ (new canonical path)..."
  mkdir -p "$SKILLS_TARGET_DIR"
  rsync -av --delete ".clinerules/skills/" "$SKILLS_TARGET_DIR/"
  rm -rf ".clinerules/skills"
  echo "   Migration complete. .clinerules/skills/ removed."
fi

# --- Main Sync Logic ---

echo "🚀 Starting HoliCode framework sync..."
echo "   Source: $FRAMEWORK_SOURCE_PATH"
echo "   Agents: $(pwd)/$AGENTS_TARGET_DIR"
echo "   Skills: $(pwd)/$SKILLS_TARGET_DIR"
echo "   Config: $(pwd)/$CONFIG_TARGET_DIR"

if [ -f ".clinerules" ]; then
  echo "❌ ERROR: '.clinerules' exists as a file in this project."
  echo "   This script requires '.clinerules/' directory layout."
  echo "   Please rename or remove '.clinerules' file and re-run update.sh."
  exit 1
fi

# Create target directories if they don't exist
mkdir -p "$AGENTS_TARGET_DIR"
mkdir -p "$SKILLS_TARGET_DIR"
mkdir -p "$CONFIG_TARGET_DIR"
mkdir -p "$HOLICODE_DATA_DIR/templates"
mkdir -p "$HOLICODE_DATA_DIR/specs"
mkdir -p "$HOLICODE_DATA_DIR/scripts"
mkdir -p "$HOLICODE_DATA_DIR/state"

# Sync a framework-managed directory with precise project-file preservation.
#
# Uses MANIFEST_FILE to track which files came from the framework. Each run:
#   1. Prune:   delete files in the old manifest that are gone from source
#               (renamed/deleted framework files — not project additions).
#   2. Protect: build --exclude rules for target files that are not in the
#               old manifest and not in the new source (true project additions).
#   3. Sync:    rsync updated framework files into the target.
#   4. Record:  update the manifest with the new source file list.
sync_framework_dir() {
  local src_dir="$1"
  local target_dir="$2"
  local label="$3"
  local manifest_key="$label"

  # --- Build new source file list ---
  local new_files=()
  if [ -d "$src_dir" ]; then
    while IFS= read -r -d '' f; do
      new_files+=("${f#./}")
    done < <(cd "$src_dir" && find . -type f -print0 2>/dev/null)
  fi

  # --- Load previous manifest for this key ---
  local old_files=()
  if [ -f "$MANIFEST_FILE" ]; then
    while IFS= read -r line; do
      [[ "$line" == "$manifest_key:"* ]] && old_files+=("${line#"$manifest_key:"}")
    done < "$MANIFEST_FILE"
  fi

  # --- Step 1: Prune stale framework files ---
  # A file is stale if it was in the old manifest but is no longer in the source.
  for old_f in "${old_files[@]}"; do
    local still_in_src=false
    for new_f in "${new_files[@]}"; do [ "$old_f" = "$new_f" ] && still_in_src=true && break; done
    if ! $still_in_src && [ -f "$target_dir/$old_f" ]; then
      echo "🗑️  Pruning stale framework $label: $old_f"
      rm "$target_dir/$old_f"
    fi
  done

  # --- Step 2: Protect project-specific files ---
  # A target file is project-specific if it is not in the old manifest AND not in the new source.
  local exclude_args=()
  if [ -d "$target_dir" ]; then
    while IFS= read -r -d '' f; do
      local rel="${f#./}"
      local is_framework=false
      for mf in "${old_files[@]}"; do [ "$mf" = "$rel" ] && is_framework=true && break; done
      if ! $is_framework; then
        for nf in "${new_files[@]}"; do [ "$nf" = "$rel" ] && is_framework=true && break; done
      fi
      $is_framework || exclude_args+=("--exclude=/$rel")
    done < <(cd "$target_dir" && find . -type f -print0 2>/dev/null)
  fi
  if [ ${#exclude_args[@]} -gt 0 ]; then
    echo "🛡️  Protecting ${#exclude_args[@]} project-specific $label file(s)"
  fi

  # --- Step 3: Sync ---
  rsync -av "${exclude_args[@]}" "$src_dir/" "$target_dir/"

  # --- Step 4: Update manifest ---
  {
    [ -f "$MANIFEST_FILE" ] && grep -v "^$manifest_key:" "$MANIFEST_FILE"
    for f in "${new_files[@]}"; do echo "$manifest_key:$f"; done
  } > "${MANIFEST_FILE}.tmp" && mv "${MANIFEST_FILE}.tmp" "$MANIFEST_FILE"
}

echo "\n🔄 Syncing agent-boot files (AGENTS.md, CLAUDE.md, symlinks) to project root..."
AGENT_BOOT_EXCLUDES=""
if [ -f "AGENTS.md" ]; then
  echo "🛡️  Preserving existing AGENTS.md (project-specific entry point)"
  AGENT_BOOT_EXCLUDES="$AGENT_BOOT_EXCLUDES --exclude=AGENTS.md"
fi
if [ -f "CLAUDE.md" ]; then
  echo "🛡️  Preserving existing CLAUDE.md (project-specific entry point)"
  AGENT_BOOT_EXCLUDES="$AGENT_BOOT_EXCLUDES --exclude=CLAUDE.md"
fi
# shellcheck disable=SC2086
rsync -av $AGENT_BOOT_EXCLUDES "$FRAMEWORK_SOURCE_PATH/agent-boot/" "."

echo "\n🔄 Syncing workflows to $AGENTS_TARGET_DIR..."
sync_framework_dir "$FRAMEWORK_SOURCE_PATH/workflows" "$AGENTS_TARGET_DIR" "agent"
rsync -av "$FRAMEWORK_SOURCE_PATH/holicode.md" ".clinerules/"

echo "\n🔄 Syncing skills to $SKILLS_TARGET_DIR..."
sync_framework_dir "$FRAMEWORK_SOURCE_PATH/skills" "$SKILLS_TARGET_DIR" "skill"

echo "\n🔄 Syncing framework config to $CONFIG_TARGET_DIR..."
sync_framework_dir "$FRAMEWORK_SOURCE_PATH/config" "$CONFIG_TARGET_DIR" "config"

# --- Create symlinks for agent discovery ---

create_symlink() {
  local link_path=$1
  local link_target=$2
  local label=$3

  mkdir -p "$(dirname "$link_path")"

  if [ -L "$link_path" ]; then
    rm "$link_path"
  fi

  if [ -e "$link_path" ]; then
    echo "⚠️  Skipping $label symlink: $link_path exists and is not a symlink."
    echo "   Move/remove it manually, then run update.sh again to create the link."
    return
  fi

  ln -s "$link_target" "$link_path"
}

echo "\n🔗 Linking agents into agent discovery paths..."
for link_path in "${AGENTS_LINK_PATHS[@]}"; do
  create_symlink "$link_path" "$AGENTS_LINK_TARGET" "agents"
done

echo "\n🔗 Linking skills into agent discovery paths..."
for link_path in "${SKILLS_LINK_PATHS[@]}"; do
  create_symlink "$link_path" "$SKILLS_LINK_TARGET" "skills"
done

echo "\n🔗 Creating backward-compat symlinks in .clinerules/..."
create_symlink ".clinerules/workflows" "$AGENTS_LINK_TARGET" "clinerules-workflows-compat"
create_symlink ".clinerules/skills" "$SKILLS_LINK_TARGET" "clinerules-skills-compat"

echo "\n🔄 Syncing templates to $HOLICODE_DATA_DIR/templates..."
sync_framework_dir "$FRAMEWORK_SOURCE_PATH/templates" "$HOLICODE_DATA_DIR/templates" "template"

echo "\n🔄 Syncing specs to $HOLICODE_DATA_DIR/specs..."
rsync -av --exclude "WORK_SPEC.md" "$FRAMEWORK_SOURCE_PATH/specs/" "$HOLICODE_DATA_DIR/specs/"

SOURCE_WORK_SPEC="$FRAMEWORK_SOURCE_PATH/specs/WORK_SPEC.md"
TARGET_WORK_SPEC="$HOLICODE_DATA_DIR/state/WORK_SPEC.md"
TARGET_WORK_SPEC_UPDATED_TEMPLATE="$HOLICODE_DATA_DIR/state/WORK_SPEC_UPDATED_TEMPLATE.md"

if [ -f "$SOURCE_WORK_SPEC" ]; then
  if [ -f "$TARGET_WORK_SPEC" ]; then
    echo "\n🛡️  Preserving existing $TARGET_WORK_SPEC"
    echo "🔄 Writing updated framework template to $TARGET_WORK_SPEC_UPDATED_TEMPLATE"
    rsync -av "$SOURCE_WORK_SPEC" "$TARGET_WORK_SPEC_UPDATED_TEMPLATE"
  else
    echo "\n🆕 No existing $TARGET_WORK_SPEC found. Installing framework WORK_SPEC.md"
    rsync -av "$SOURCE_WORK_SPEC" "$TARGET_WORK_SPEC"
  fi
fi

echo "\n🔄 Syncing scripts to $HOLICODE_DATA_DIR/scripts..."
rsync -av --delete "$FRAMEWORK_SOURCE_PATH/scripts/" "$HOLICODE_DATA_DIR/scripts/"

echo "\n🔄 Syncing documentation templates to docs/..."
if [ -d "$FRAMEWORK_SOURCE_PATH/docs-templates" ]; then
    rsync -av --delete "$FRAMEWORK_SOURCE_PATH/docs-templates/" "docs/"
fi

echo "\n✅ Sync complete. Your project's HoliCode framework is up to date."
echo "   Canonical paths: .github/agents/ (workflows), .github/skills/ (skills)"
echo "   Symlinked for: Claude Code, OpenCode, Gemini, Qwen, .agents/ (cross-agent)"
