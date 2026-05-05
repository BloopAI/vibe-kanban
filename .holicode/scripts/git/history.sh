#!/usr/bin/env bash

# scripts/git/history.sh
#
# This script provides a set of functionalities for managing Git history,
# including interactive rebase, cherry-picking, history cleanup, and commit analysis.
# It ensures safe operations with pre-checks and provides JSON output.
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

# Function to perform safety checks before history operations
perform_safety_checks() {
    log_info "Performing safety checks before history operation..."

    # Check for uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        log_warn "Uncommitted changes detected."
        json_err "Uncommitted changes detected. Please stash or commit them before proceeding." \
            "status" "uncommitted_changes"
        exit 1
    fi
    
    # Create backup reference
    local backup_branch="backup-$(date +%Y%m%d-%H%M%S)"
    git branch "$backup_branch" >/dev/null 2>&1 || { 
        json_err "Failed to create backup branch." "branch_name" "$backup_branch"
        exit 1
    }
    log_info "Backup created: ${backup_branch}"
    
    # Check if branch is pushed to remote
    local current_branch=$(git_current_branch)
    if git rev-parse --verify "origin/${current_branch}" > /dev/null 2>&1; then
        log_warn "This branch exists on remote. History rewriting will require force push."
        json_err "Branch '${current_branch}' exists on remote. History rewriting will require force push. Manual confirmation required." \
            "status" "remote_branch_exists" \
            "branch" "$current_branch"
        exit 1
    fi
    json_ok "Safety checks passed."
}

# Function to perform interactive rebase operations
interactive_rebase() {
    local base_ref=$1
    local rebase_type=$2  # squash, cleanup, reword, edit, drop

    log_info "Starting interactive rebase on '${base_ref}' with type '${rebase_type}'..."

    case "$rebase_type" in
        "squash")
            log_info "Preparing to squash commits. Displaying commits for reference:"
            git log --oneline "${base_ref}"..HEAD
            GIT_SEQUENCE_EDITOR="sed -i '2,\$s/^pick/squash/'" git rebase -i "${base_ref}" || {
                json_err "Interactive rebase (squash) failed."
                exit 1
            }
            ;;
            
        "cleanup")
            log_info "Cleaning up commit history with autosquash."
            git rebase -i --autosquash "${base_ref}" || {
                json_err "Interactive rebase (cleanup) failed."
                exit 1
            }
            ;;
            
        "reword")
            log_info "Rewording commits. Editor will open for each commit."
            git rebase -i "${base_ref}" || {
                json_err "Interactive rebase (reword) failed."
                exit 1
            }
            ;;
        *)
            json_err "Unsupported rebase type: ${rebase_type}. Supported: squash, cleanup, reword."
            exit 1
            ;;
    esac
    json_ok "Interactive rebase completed successfully." \
        "base_ref" "$base_ref" \
        "rebase_type" "$rebase_type"
}

# Function to improve commit messages to follow conventional format
improve_commit_messages() {
    local base_ref=$1
    log_info "Checking commit messages against conventional format from '${base_ref}'..."

    local commits_to_fix=$(git log --oneline "${base_ref}"..HEAD | \
        grep -v -E '^[a-f0-9]+ (feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?: ')
    
    if [ -n "$commits_to_fix" ]; then
        log_warn "Found commits not following conventional format:"
        echo "$commits_to_fix"
        log_info "Starting interactive rebase to reword messages. Please edit as needed."
        git rebase -i "${base_ref}" || {
            json_err "Failed to improve commit messages via interactive rebase."
            exit 1
        }
        json_ok "Commit messages improved. Please verify."
    else
        json_ok "All commits follow conventional format."
    fi
}

# Function to perform cherry-pick operations
cherry_pick_commits() {
    local source_branch=$1
    local target_commits=$2  # Can be single commit or range
    local strategy=${3:-standard} # mainline, no-commit, edit, standard
    
    log_info "Cherry-picking commit(s) '${target_commits}' from branch '${source_branch}' with strategy '${strategy}'."

    # Ensure source branch exists
    git show-ref --verify --quiet "refs/heads/${source_branch}" || {
        json_err "Source branch '${source_branch}' does not exist."
        exit 1
    }

    # Save current branch
    local current_branch=$(git_current_branch)
    
    # Perform cherry-pick with options
    local cherry_pick_cmd="git cherry-pick"
    case "$strategy" in
        "mainline")
            cherry_pick_cmd+=" -m 1" # For merge commits
            ;;
        "no-commit")
            cherry_pick_cmd+=" -n" # Stage changes without committing
            ;;
        "edit")
            cherry_pick_cmd+=" -e" # Allow editing commit message
            ;;
        "standard")
            ;;
        *)
            json_err "Unsupported cherry-pick strategy: ${strategy}. Supported: mainline, no-commit, edit, standard."
            exit 1
            ;;
    esac
    cherry_pick_cmd+=" ${target_commits}"

    eval "$cherry_pick_cmd" || {
        log_error "Cherry-pick conflict detected."
        json_err "Cherry-pick failed due to conflicts or other issues. Please resolve manually or use 'git conflict-resolver'." \
            "command" "$cherry_pick_cmd" \
            "commits" "$target_commits"
        exit 1
    }
    
    if [ "$strategy" == "no-commit" ]; then
        json_ok "Cherry-pick successful. Changes staged, manual commit required." \
            "commits" "$target_commits" \
            "strategy" "$strategy"
    else
        json_ok "Cherry-pick completed successfully." \
            "commits" "$target_commits" \
            "strategy" "$strategy"
    fi
}

# Function to squash related commits based on a pattern
squash_related_commits() {
    local pattern=$1  # e.g., "TASK-001"
    log_info "Squashing commits related to pattern: '${pattern}'..."

    # Find all commits matching pattern
    local matching_commits=$(git log --oneline --grep="${pattern}" --reverse | awk '{print $1}')
    
    if [ -z "$matching_commits" ]; then
        json_err "No commits found matching pattern: ${pattern}."
        exit 1
    fi

    local first_commit=$(echo "$matching_commits" | head -1)
    local parent_commit=$(git rev-parse "${first_commit}"^)

    log_info "Found commits to squash:"
    git log --oneline --grep="${pattern}"

    log_info "Starting interactive rebase from parent '${parent_commit}'."
    git rebase -i "${parent_commit}" || {
        json_err "Failed to squash commits via interactive rebase."
        exit 1
    }
    json_ok "Related commits squashed successfully." \
        "pattern" "$pattern"
}

# Function to remove sensitive data from history (requires external tools for content)
remove_sensitive_data() {
    local file_pattern=$1
    local removal_type=$2 # file, content

    log_warn "WARNING: This operation will rewrite entire history and is irreversible without backups."
    json_err "History rewrite for sensitive data removal is a destructive operation. Manual confirmation and understanding of risks (e.g., BFG Repo-Cleaner) is required." \
        "file_pattern" "$file_pattern" \
        "removal_type" "$removal_type"
    exit 1 # Require manual confirmation/tool usage for this
}

# Function to compare branches
compare_branches() {
    local branch1=$1
    local branch2=$2
    local comparison_type=${3:-commits} # commits, files, stats

    log_info "Comparing branches '${branch1}' and '${branch2}' by type '${comparison_type}'."

    case "$comparison_type" in
        "commits")
            log_info "Commits in ${branch1} but not in ${branch2}:"
            git log --oneline "${branch2}".."${branch1}"
            log_info "Commits in ${branch2} but not in ${branch1}:"
            git log --oneline "${branch1}".."${branch2}"
            ;;
            
        "files")
            log_info "Files changed between ${branch1} and ${branch2}:"
            git diff --name-status "${branch1}".."${branch2}"
            ;;
            
        "stats")
            log_info "Statistics for differences between ${branch1} and ${branch2}:"
            git diff --stat "${branch1}".."${branch2}"
            ;;
        *)
            json_err "Unsupported comparison type: ${comparison_type}. Supported: commits, files, stats."
            exit 1
            ;;
    esac
    json_ok "Branch comparison completed." \
        "branch1" "$branch1" \
        "branch2" "$branch2" \
        "comparison_type" "$comparison_type"
}

# Function to search commits
search_commits() {
    local search_type=$1
    local search_term=$2
    local options=$3 # Additional git log options

    log_info "Searching commits by '${search_type}' for term '${search_term}'."

    local search_cmd="git log --oneline ${options}"
    case "$search_type" in
        "message")
            search_cmd+=" --grep=\"${search_term}\""
            ;;
            
        "author")
            search_cmd+=" --author=\"${search_term}\""
            ;;
            
        "file")
            search_cmd="git log --follow --oneline \"${search_term}\""
            ;;
            
        "content")
            search_cmd+=" -S\"${search_term}\""
            ;;
            
        "date")
            local until_date=${options} # assuming options is the until date if search_type is date
            search_cmd="git log --oneline --since=\"${search_term}\" --until=\"${until_date}\""
            ;;
        *)
            json_err "Unsupported search type: ${search_type}. Supported: message, author, file, content, date."
            exit 1
            ;;
    esac

    eval "$search_cmd" || {
        json_err "Failed to search commits." \
            "search_type" "$search_type" \
            "search_term" "$search_term"
        exit 1
    }
    json_ok "Commit search completed." \
        "search_type" "$search_type" \
        "search_term" "$search_term"
}

# Function to safely rewrite history (wrapper for common operations)
safe_rewrite_history() {
    local operation=$1
    local scope=${2:-local} # local, remote

    log_info "Attempting safe history rewrite: '${operation}' with scope '${scope}'."

    # Validate before rewriting (simplified, full checks in perform_safety_checks)
    local current_branch=$(git_current_branch)
    if is_protected_branch "${current_branch}"; then
        json_err "Cannot rewrite history on protected branch: ${current_branch}."
        exit 1
    fi

    # Perform operation
    case "$operation" in
        "squash-all")
            log_info "Squashing all commits into one."
            git reset --soft "$(git rev-list --max-parents=0 HEAD)" || {
                json_err "Failed to reset for squash-all."
                exit 1
            }
            git commit --amend -m "chore: squashed history for cleanup" || {
                json_err "Failed to amend commit for squash-all."
                exit 1
            }
            ;;
            
        "rebase-main")
            log_info "Rebasing current branch onto latest main."
            git fetch origin main || { json_err "Failed to fetch origin main." ; exit 1; }
            git rebase "origin/main" || {
                json_err "Failed to rebase onto origin/main. Conflicts may exist or rebase failed."
                exit 1
            }
            ;;
            
        "cleanup-merges")
            log_info "Cleaning up merge commits by rebasing."
            # Note: This is a complex operation and requires careful handling.
            # The original workflow had 'HEAD~20' which is arbitrary.
            # A more robust solution would involve detecting merge commits or specific range.
            git rebase -i --rebase-merges=no-rebase-cousins "$(git merge-base "$(git_current_branch)" origin/main)" || {
                json_err "Failed to cleanup merges via rebase. Conflicts may exist or rebase failed."
                exit 1
            }
            ;;
        *)
            json_err "Unsupported history rewrite operation: ${operation}. Supported: squash-all, rebase-main, cleanup-merges."
            exit 1
            ;;
    esac
    
    # Handle remote sync if needed
    if [ "$scope" = "remote" ]; then
        log_info "Pushing rewritten history to remote..."
        git push --force-with-lease origin "${current_branch}" || {
            json_err "Failed to force push to remote. Ensure you have permissions and understand the impact."
            exit 1
        }
    fi
    json_ok "Safe history rewrite completed successfully." \
        "operation" "$operation" \
        "scope" "$scope"
}

# Function to visualize history
visualize_history() {
    local viz_type=$1
    log_info "Visualizing history with type: '${viz_type}'."

    local viz_cmd=""
    case "$viz_type" in
        "graph")
            viz_cmd="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"
            ;;
            
        "timeline")
            viz_cmd="git log --pretty=format:'%ai %h %s' --date=short"
            ;;
            
        "contributors")
            viz_cmd="git shortlog -sn --all"
            ;;
            
        "activity")
            viz_cmd="git log --format='%ai' | awk '{print \$1}' | sort | uniq -c | tail -30"
            ;;
        *)
            json_err "Unsupported visualization type: ${viz_type}. Supported: graph, timeline, contributors, activity."
            exit 1
            ;;
    esac

    eval "$viz_cmd" || {
        json_err "Failed to visualize history." \
            "viz_type" "$viz_type"
        exit 1
    }
    json_ok "History visualization completed." \
        "viz_type" "$viz_type"
}

# --- Main execution logic ---
# This script is designed to be called with specific function names as arguments.
# Example: ./history.sh interactive_rebase main squash
_main() {
    if [ "$#" -eq 0 ]; then
        json_err "No command provided. Usage: history.sh <command> [<args>...]" \
            "available_commands" "$(declare -F | awk '{print $3}' | grep -v '^_')"
        exit 1
    fi

    local cmd="$1"
    shift # Remove the command from the arguments list

    # Check if the function exists and call it
    if declare -f "$cmd" > /dev/null; then
        "$cmd" "$@"
    else
        json_err "Unknown command: ${cmd}" \
            "available_commands" "$(declare -F | awk '{print $3}' | grep -v '^_')"
        exit 1
    fi
}

_main "$@"
