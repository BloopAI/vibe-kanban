#!/usr/bin/env bash

# scripts/git/conflicts.sh
#
# This script handles Git merge conflict detection and resolution.
# It categorizes conflicts and attempts automated resolution based on file type.
# For complex code conflicts, it creates SPIKE tasks.
#
# Adheres to strict shell mode and emits standardized JSON output.

# Strict mode: E = error, u = unset variables, o pipefail = pipeline errors
set -Eeuo pipefail

# Source common functions and libraries
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/git.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/json.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/compat.sh" # For cross-platform commands

# --- Global Variables ---
declare CONFLICT_TYPE="" # merge, rebase, or cherry-pick

# --- Functions ---

# Function to detect conflicts and determine conflict type
detect_conflicts() {
    local conflict_status=$(git status --porcelain | grep "^UU\|^AA\|^DD")

    if [ -n "$conflict_status" ]; then
        log_info "Conflicts detected."
        # Determine conflict context
        if [ -f .git/MERGE_HEAD ]; then
            CONFLICT_TYPE="merge"
        elif [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
            CONFLICT_TYPE="rebase"
        elif [ -f .git/CHERRY_PICK_HEAD ]; then
            CONFLICT_TYPE="cherry-pick"
        else
            CONFLICT_TYPE="unknown"
        fi
        log_info "Conflict type: ${CONFLICT_TYPE}"
        echo "$conflict_status"
        return 0 # Conflicts detected
    else
        log_info "No conflicts detected."
        return 1 # No conflicts
    fi
}

# Function to categorize a file based on its path
categorize_file() {
    local file=$1
    if [[ "$file" =~ ^\.holicode/specs/.*\.md$ ]]; then
        echo "specification_file"
    elif [[ "$file" =~ ^src/.*\.(ts|js|tsx|jsx)$ ]]; then
        echo "code_file"
    elif [[ "$file" =~ \.(json|yaml|yml|toml)$ ]]; then
        echo "configuration_file"
    elif [[ "$file" =~ ^docs/.*\.md$|README\.md$ ]]; then
        echo "documentation_file"
    elif [[ "$file" =~ ^test/.*\.(spec|test)\.(ts|js)$ ]]; then
        echo "test_file"
    else
        echo "other_file"
    fi
}

# Function to create a SPIKE task for complex conflicts
create_spike_for_conflict() {
    local file=$1
    local task_id="SPIKE-CONFLICT-$(date +%Y%m%d-%H%M%S)"
    local spike_path=".holicode/specs/tasks/${task_id}.md"

    cat > "${spike_path}" << EOF
# SPIKE: Resolve Merge Conflict in ${file}

## Issue
Merge conflict detected requiring manual resolution

## Conflict Details
- File: ${file}
- Conflict Type: ${CONFLICT_TYPE}
- Lines Affected: $(git diff --check "${file}" | wc -l | tr -d '[:space:]')

## Investigation Scope
- [ ] Understand intent of both changes
- [ ] Determine correct resolution approach
- [ ] Test both versions independently
- [ ] Propose merged solution

## Time Box
Maximum: 2 hours

## Success Criteria
- [ ] Conflict resolved without breaking functionality
- [ ] Tests pass for resolved version
- [ ] Both intents preserved where possible
EOF
    log_info "Created SPIKE task for ${file}: ${spike_path}"
    echo "${spike_path}"
}

# Function to attempt automated resolution for specific file types
attempt_auto_resolution() {
    local file=$1
    local category=$2
    local result=1 # Assume failure

    case "$category" in
        "specification_file")
            log_info "Attempting intelligent merge for specification: ${file}"
            # Extract both versions
            git show :2:"${file}" > "${file}.ours"
            git show :3:"${file}" > "${file}.theirs"

            # Merge specifications by combining content and adding review notes
            echo "## Merged Specification" > "${file}"
            echo "<!-- CONFLICT RESOLUTION: Merged $(date) -->" >> "${file}"
            echo "" >> "${file}"
            echo "### Original Version (Ours)" >> "${file}"
            cat "${file}.ours" >> "${file}"
            echo "" >> "${file}"
            echo "### Incoming Changes (Theirs)" >> "${file}"
            cat "${file}.theirs" >> "${file}"
            echo "" >> "${file}"
            echo "### [REVIEW NEEDED] Reconciliation Required" >> "${file}"

            # Stage the merged file
            git add "${file}" && result=0 || result=1
            rm -f "${file}.ours" "${file}.theirs"
            ;;

        "configuration_file")
            log_info "Attempting intelligent merge for config: ${file}"
            # For simplicity, accepting incoming changes for now as per workflow example.
            # A more complex JSON merge logic would be implemented here if needed.
            git checkout --theirs "${file}" && result=0 || result=1
            git add "${file}" && result=0 || result=1
            log_info "Accepted incoming configuration changes for ${file}"
            ;;

        "documentation_file")
            log_info "Combining documentation content for: ${file}"
            # Combine both versions
            git checkout --ours "${file}" && result=0 || result=1
            echo -e "\n\n<!-- MERGED CONTENT FROM INCOMING CHANGES -->\n" >> "${file}"
            git show :3:"${file}" >> "${file}"
            git add "${file}" && result=0 || result=1
            ;;

        "test_file")
            log_info "Attempting to preserve all test cases for: ${file}"
            # For test files, often you want to keep both sets of changes
            git checkout --ours "${file}" && result=0 || result=1
            echo -e "\n\n<!-- MERGED TEST CASES FROM INCOMING CHANGES -->\n" >> "${file}"
            git show :3:"${file}" >> "${file}"
            git add "${file}" && result=0 || result=1
            ;;

        *)
            log_info "No automated resolution strategy for category '${category}' for file: ${file}"
            result=1
            ;;
    esac
    return $result
}

# Main conflict resolution workflow
resolve_all_conflicts() {
    local conflicts_resolved=0
    local conflicts_remaining=0
    local spikes_created=0
    local conflicted_files_list=""

    # Get list of conflicted files using a temporary file for robustness
    local temp_conflicts_file=$(mktemp)
    git diff --name-only --diff-filter=U > "$temp_conflicts_file"
    conflicted_files_list=$(cat "$temp_conflicts_file")
    rm -f "$temp_conflicts_file"

    if [ -z "$conflicted_files_list" ]; then
        json_ok "No conflicts to resolve."
        exit 0
    fi

    for file in $conflicted_files_list; do
        log_info "Processing conflict in: ${file}"
        
        # Categorize the file
        local category=$(categorize_file "${file}")
        
        # Attempt resolution
        if attempt_auto_resolution "${file}" "${category}"; then
            conflicts_resolved=$((conflicts_resolved + 1))
            log_info "✓ Automatically resolved: ${file}"
        else
            # Create SPIKE for complex conflicts (code files and others without auto-resolution)
            if [ "$category" == "code_file" ] || [ "$category" == "other_file" ]; then
                local spike_path=$(create_spike_for_conflict "${file}")
                spikes_created=$((spikes_created + 1))
                conflicts_remaining=$((conflicts_remaining + 1))
                log_info "⚠ SPIKE created for: ${file} at ${spike_path}"
            else
                conflicts_remaining=$((conflicts_remaining + 1))
                log_error "Failed to auto-resolve and no SPIKE created for category '${category}' for file: ${file}. Manual intervention required."
            fi
        fi
    done
    
    # Summary
    if [ "$conflicts_remaining" -eq 0 ]; then
        json_ok "All conflicts resolved." \
            "resolved_count" "$conflicts_resolved" \
            "spike_count" "$spikes_created" \
            "remaining_count" "$conflicts_remaining"
    else
        json_err "Conflicts remain or SPIKE tasks created." \
            "resolved_count" "$conflicts_resolved" \
            "spike_count" "$spikes_created" \
            "remaining_count" "$conflicts_remaining"
    fi
}

# --- Main execution ---
if detect_conflicts; then
    resolve_all_conflicts
else
    json_ok "No conflicts to resolve."
fi
