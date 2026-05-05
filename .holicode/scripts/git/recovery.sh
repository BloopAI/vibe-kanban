#!/usr/bin/env bash

# scripts/git/recovery.sh
#
# This script provides functionalities for Git repository recovery and repair.
# It includes tools for recovering lost commits, repairing corrupted repositories,
# performing rollbacks, handling detached HEAD states, and managing large files.
#
# Adheres to strict shell mode and emits standardized JSON output.

# Strict mode: E = error, u = unset variables, o pipefail = pipeline errors
set -Eeuo pipefail

# Source common functions and libraries
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/git.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/json.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/compat.sh" # For cross-platform commands

# --- Functions ---

# Function to assess repository state and create emergency backup
assess_repository_state() {
    log_info "Assessing repository health..."
    local issues=()
    local health_status="healthy"

    # Check basic Git functionality
    if ! git status > /dev/null 2>&1; then
        issues+=("git_corrupted")
        health_status="critical"
        log_error "CRITICAL: Git repository is corrupted."
    else
        log_info "Git repository is functional."
    fi
    
    # Detached HEAD
    if [ "$(git symbolic-ref -q HEAD)" = "" ]; then
        issues+=("detached_head")
        health_status="warning"
        log_warn "Repository is in detached HEAD state."
    fi
    
    # Large files (over 100MB)
    local large_files=$(find . -type f -size +100M 2>/dev/null | grep -v .git)
    if [ -n "$large_files" ]; then
        issues+=("large_files")
        health_status="warning"
        log_warn "Large files detected (>100MB) in working directory."
    fi
    
    # Corrupted objects (basic check)
    if ! git fsck --full > /dev/null 2>&1; then
        issues+=("corrupted_objects")
        health_status="critical"
        log_error "Corrupted objects detected by git fsck."
    fi
    
    # Create emergency backup
    if [ -d .git ]; then
        local backup_dir="../git-backup-$(date +%Y%m%d-%H%M%S)"
        log_info "Creating emergency backup at ${backup_dir}"
        cp -r .git "${backup_dir}" || {
            json_err "Failed to create emergency backup." \
                "status" "${health_status}" \
                "issues" "$(IFS=,; echo "${issues[*]}")"
            exit 1
        }
        log_info "Backup created: ${backup_dir}"
    fi

    if [ "${#issues[@]}" -eq 0 ]; then
        json_ok "Repository health assessment complete." \
            "status" "${health_status}" \
            "issues" "none"
    else
        json_err "Repository health assessment complete with issues." \
            "status" "${health_status}" \
            "issues" "$(IFS=,; echo "${issues[*]}")"
    fi
}

# Function to recover lost commits using reflog
recover_lost_commits() {
    local search_term=${1:-}
    log_info "Recovering lost commits. Displaying reflog..."

    git reflog --date=relative --format="%C(yellow)%h%C(reset) %C(blue)%gd%C(reset) %C(green)(%ar)%C(reset) %gs" | head -20

    if [ -n "$search_term" ]; then
        log_info "Searching reflog for: ${search_term}"
        git reflog --grep="${search_term}"
    fi

    json_ok "Reflog displayed. Use 'recover_specific_commit' or 'recover_deleted_branch' with a hash/name."
}

# Recover a specific commit by hash
recover_specific_commit() {
    local commit_hash=$1
    local recovery_branch="recovery-$(date +%Y%m%d-%H%M%S)"

    log_info "Attempting to recover commit: ${commit_hash}"

    if git cat-file -e "${commit_hash}" 2>/dev/null; then
        git branch "${recovery_branch}" "${commit_hash}" || {
            json_err "Failed to create recovery branch for commit: ${commit_hash}."
            exit 1
        }
        log_info "Created recovery branch: ${recovery_branch} at commit $(git log -1 --oneline "${commit_hash}")"
        json_ok "Commit recovered to new branch." \
            "commit_hash" "${commit_hash}" \
            "new_branch" "${recovery_branch}"
    else
        json_err "Commit ${commit_hash} not found in repository."
    fi
}

# Recover a deleted branch
recover_deleted_branch() {
    local branch_name=$1
    log_info "Attempting to recover deleted branch: ${branch_name}"

    local deletion_point=$(git reflog --format="%h %gs" | grep "branch: Created from ${branch_name}" | head -1 | cut -d' ' -f1)

    if [ -z "$deletion_point" ]; then
        # Fallback to searching for direct deletion entry
        deletion_point=$(git reflog --format="%h %gs" | grep "branch: Deleted ${branch_name}" | head -1 | cut -d' ' -f1)
    fi

    if [ -n "$deletion_point" ]; then
        git branch "${branch_name}" "${deletion_point}" || {
            json_err "Failed to recreate branch: ${branch_name} at deletion point."
            exit 1
        }
        json_ok "Recovered branch: ${branch_name} at ${deletion_point}." \
            "branch_name" "${branch_name}" \
            "recovery_hash" "${deletion_point}"
    else
        json_err "Could not find deletion point for branch: ${branch_name}. Try searching reflog manually."
    fi
}

# Show dangling commits (unreachable from any ref)
show_dangling_commits() {
    log_info "Searching for dangling commits..."
    local dangling=$(git fsck --lost-found 2>/dev/null | grep "^dangling commit" | awk '{print $3}')

    if [ -n "$dangling" ]; then
        log_info "Dangling commits found:"
        local commit_list=""
        while IFS= read -r commit; do
            local commit_summary=$(git log -1 --oneline "${commit}" 2>/dev/null || echo " (unable to display summary)")
            log_info "  - ${commit}: ${commit_summary}"
            commit_list+="${commit},"
        done <<< "$dangling"
        json_ok "Dangling commits listed." \
            "dangling_commits" "${commit_list%,}"
    else
        json_ok "No dangling commits found."
    fi
}

# Function to repair corrupted repository
repair_corrupted_repository() {
    log_info "Starting repository repair process..."
    local fsck_report_file=$(mktemp)

    log_info "Step 1: Running integrity check..."
    git fsck --full 2>&1 | tee "${fsck_report_file}"

    if grep -q "error" "${fsck_report_file}"; then
        log_warn "Errors detected. Attempting repairs..."

        log_info "Step 2: Attempting to prune unreachable objects and remove corrupted packs..."
        git prune || true # Prune unreachable objects
        git repack -ad || true # Repack objects, deleting unreferenced ones

        log_info "Step 3: Fetching missing objects from remotes..."
        git fetch --all --tags || true # Fetch from all remotes, ignore errors

        log_info "Step 4: Running garbage collection..."
        git gc --aggressive --prune=now || true

        log_info "Step 5: Final verification..."
        if git fsck --full; then
            json_ok "Repository repair successful."
        else
            json_err "Repository still has issues after repair attempts. Manual intervention required."
        fi
    else
        json_ok "No corruption detected by git fsck."
    fi
    rm -f "${fsck_report_file}"
}

# Function to perform a git reset
perform_reset() {
    local target=$1
    local mode=$2 # --hard, --soft, --mixed

    log_info "Performing Git reset to '${target}' with mode '${mode}'."

    # Validate target
    if ! git rev-parse --quiet --verify "${target}" >/dev/null; then
        json_err "Invalid target for reset: ${target}."
        exit 1
    fi

    # Show what will be lost for --hard
    if [ "$mode" == "--hard" ]; then
        log_warn "WARNING: Performing a hard reset will discard all uncommitted changes and unpushed commits."
        local lost_commits=$(git log --oneline "${target}"..HEAD 2>/dev/null)
        if [ -n "$lost_commits" ]; then
            log_warn "Commits that will be lost:\n${lost_commits}"
        else
            log_info "No commits will be lost by this hard reset."
        fi
    fi

    # Create backup branch before destructive reset
    if [ "$mode" == "--hard" ]; then
        local backup_branch="pre-reset-$(date +%Y%m%d-%H%M%S)"
        git branch "${backup_branch}" || {
            json_err "Failed to create pre-reset backup branch."
            exit 1
        }
        log_info "Backup created: ${backup_branch}"
    fi

    git reset "${mode}" "${target}" || {
        json_err "Git reset failed." \
            "target" "${target}" \
            "mode" "${mode}"
        exit 1
    }
    json_ok "Git reset completed successfully." \
        "target" "${target}" \
        "mode" "${mode}"
}

# Function to reset to remote state
reset_to_remote() {
    local remote=${1:-origin}
    local branch=${2:-$(git_current_branch)}

    log_info "Resetting current branch '${branch}' to remote state '${remote}/${branch}'."

    if ! git remote get-url "${remote}" >/dev/null 2>&1; then
        json_err "Remote '${remote}' does not exist."
        exit 1
    fi

    git fetch "${remote}" || { json_err "Failed to fetch from remote '${remote}'." ; exit 1; }

    local local_only_commits=$(git log --oneline "${remote}/${branch}"..HEAD 2>/dev/null)
    if [ -n "$local_only_commits" ]; then
        log_warn "Local commits that will be lost:\n${local_only_commits}"
    else
        log_info "No local commits will be lost."
    fi

    git reset --hard "${remote}/${branch}" || {
        json_err "Failed to reset to remote state." \
            "remote" "${remote}" \
            "branch" "${branch}"
        exit 1
    }
    json_ok "Reset to remote state completed successfully." \
        "remote" "${remote}" \
        "branch" "${branch}"
}

# Time-based rollback
time_based_rollback() {
    local time_spec=$1
    log_info "Performing time-based rollback to '${time_spec}'."

    local target_hash=$(git rev-list -n 1 "HEAD@{${time_spec}}" 2>/dev/null)
    if [ -z "$target_hash" ]; then
        json_err "Could not find a commit for time specification: ${time_spec}. Ensure reflog has history for this period."
        exit 1
    fi
    log_info "Found commit ${target_hash} for time spec."
    perform_reset "${target_hash}" "--hard" || exit 1
    json_ok "Time-based rollback completed successfully." \
        "time_spec" "${time_spec}" \
        "target_hash" "${target_hash}"
}

# Recover from detached HEAD state
recover_from_detached_head() {
    log_info "Attempting to recover from detached HEAD state."

    if [ "$(git symbolic-ref -q HEAD)" != "" ]; then
        json_ok "Not in detached HEAD state. Current branch is: $(git_current_branch)."
        return 0
    fi
    
    local current_commit=$(git rev-parse HEAD)
    log_info "Currently at detached HEAD commit: ${current_commit} ($(git log -1 --oneline "${current_commit}"))"
    
    json_err "In detached HEAD state. Please use 'create_branch_from_detached_head' or 'reattach_to_branch'." \
        "current_commit" "${current_commit}"
}

# Create a new branch from detached HEAD
create_branch_from_detached_head() {
    local new_branch_name=$1
    log_info "Creating new branch '${new_branch_name}' from current detached HEAD."

    if [ "$(git symbolic-ref -q HEAD)" != "" ]; then
        json_err "Not in detached HEAD state. Cannot create new branch from detached HEAD."
        exit 1
    fi
    
    git checkout -b "${new_branch_name}" || {
        json_err "Failed to create and switch to new branch: ${new_branch_name}."
        exit 1
    }
    json_ok "Created and switched to new branch: ${new_branch_name}." \
        "new_branch" "${new_branch_name}"
}

# Reattach to an existing branch from detached HEAD
reattach_to_branch() {
    local target_branch=$1
    log_info "Reattaching to existing branch '${target_branch}' from detached HEAD."

    if [ "$(git symbolic-ref -q HEAD)" != "" ]; then
        json_err "Not in detached HEAD state. Cannot reattach to branch."
        exit 1
    fi

    if ! git show-ref --verify --quiet "refs/heads/${target_branch}"; then
        json_err "Target branch '${target_branch}' does not exist."
        exit 1
    fi

    local current_detached_commit=$(git rev-parse HEAD)
    git checkout "${target_branch}" || {
        json_err "Failed to checkout target branch: ${target_branch}."
        exit 1
    }
    git merge "${current_detached_commit}" || {
        json_err "Failed to merge detached HEAD commit into ${target_branch}. Conflicts may exist."
        exit 1
    }
    json_ok "Reattached to branch '${target_branch}' and merged detached HEAD changes." \
        "target_branch" "${target_branch}" \
        "merged_commit" "${current_detached_commit}"
}

# Remove large files from history using git filter-repo (recommended over filter-branch)
remove_large_files_from_history() {
    local file_pattern=$1
    log_warn "WARNING: Removing large files from history will rewrite entire history and is a destructive operation."
    log_warn "This typically requires 'git filter-repo' which is not part of Git core."
    log_warn "Please ensure 'git filter-repo' is installed and you understand its usage."

    json_err "Large file removal from history requires 'git filter-repo' and manual confirmation. It is a destructive operation." \
        "file_pattern" "${file_pattern}" \
        "recommendation" "Install git-filter-repo (e.g., pip install git-filter-repo) and use it manually." \
        "example_command" "git filter-repo --path ${file_pattern} --invert-paths"
    exit 1
}

# Create a comprehensive backup of the repository
create_comprehensive_backup() {
    local backup_name=$1
    [ -z "$backup_name" ] && backup_name="repo-backup-$(date +%Y%m%d-%H%M%S)"
    
    local backup_dir="../git-backups/${backup_name}"
    log_info "Creating comprehensive backup at ${backup_dir}.tar.gz"
    
    mkdir -p "${backup_dir}/git" || { json_err "Failed to create backup directory."; exit 1; }
    
    # Backup .git directory (bare clone for full history)
    log_info "Backing up Git repository (bare clone)..."
    git clone --bare . "${backup_dir}/git" || { json_err "Failed to create bare clone backup."; exit 1; }
    
    # Backup working directory (excluding .git and common build artifacts)
    log_info "Backing up working directory..."
    rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='build' --exclude='*.log' . "${backup_dir}/working" || { json_err "Failed to backup working directory."; exit 1; }
    
    # Create backup manifest
    cat > "${backup_dir}/manifest.txt" << EOF
Backup Created: $(date)
Repository Name: $(basename "$(pwd)")
Current Branch: $(git_current_branch)
Latest Commit: $(git rev-parse HEAD)
Remote URL: $(git remote get-url origin 2>/dev/null || echo "No remote")
Working Directory Clean: $(if [ -z "$(git status --porcelain)" ]; then echo "Yes"; else echo "No"; fi)
EOF
    
    # Compress backup
    log_info "Compressing backup..."
    tar -czf "${backup_dir}.tar.gz" -C "$(dirname "${backup_dir}")" "$(basename "${backup_dir}")" || { json_err "Failed to compress backup."; exit 1; }
    rm -rf "${backup_dir}"
    
    json_ok "Comprehensive backup created successfully." \
        "backup_path" "${backup_dir}.tar.gz"
}

# Restore from a comprehensive backup
restore_from_backup() {
    local backup_file=$1
    log_info "Restoring from backup file: ${backup_file}"

    if [ ! -f "${backup_file}" ]; then
        json_err "Backup file not found: ${backup_file}."
        exit 1
    fi

    local temp_dir=$(mktemp -d)
    tar -xzf "${backup_file}" -C "${temp_dir}" || { json_err "Failed to extract backup file."; rm -rf "${temp_dir}"; exit 1; }
    
    local extracted_dir=$(find "${temp_dir}" -maxdepth 1 -type d -name "repo-backup-*" -print -quit)
    if [ -z "${extracted_dir}" ]; then
        json_err "Could not find extracted backup directory within ${temp_dir}."
        rm -rf "${temp_dir}"; exit 1;
    fi

    log_info "Backup information:\n$(cat "${extracted_dir}/manifest.txt")"
    
    log_warn "WARNING: This will overwrite your current repository and working directory."
    json_err "Restoring from backup is a destructive operation. Manual confirmation is required." \
        "backup_file" "${backup_file}" \
        "extracted_path" "${extracted_dir}"
    exit 1 # Require manual confirmation for destructive restore
}

# --- Main execution logic ---
_main() {
    if [ "$#" -eq 0 ]; then
        json_err "No command provided. Usage: recovery.sh <command> [<args>...]" \
            "available_commands" "$(declare -F | awk '{print $3}' | grep -v '^_')"
        exit 1
    fi

    local cmd="$1"
    shift # Remove the command from the arguments list

    if declare -f "$cmd" > /dev/null; then
        "$cmd" "$@"
    else
        json_err "Unknown command: ${cmd}" \
            "available_commands" "$(declare -F | awk '{print $3}' | grep -v '^_')"
        exit 1
    fi
}

_main "$@"
