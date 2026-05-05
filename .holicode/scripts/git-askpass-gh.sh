#!/bin/sh
# Git askpass helper script using GitHub CLI token
# This script provides Git credentials using the GitHub CLI authentication

# Check if gh is installed and authenticated
if ! command -v gh >/dev/null 2>&1; then
    echo "Error: GitHub CLI (gh) is not installed" >&2
    exit 1
fi

# Check authentication status
if ! gh auth status >/dev/null 2>&1; then
    echo "Error: GitHub CLI is not authenticated. Run 'gh auth login'" >&2
    exit 1
fi

# Respond based on the prompt
case "$1" in
    *Username*)
        # Return the username (use git config or current user)
        git_user=$(git config --get user.name 2>/dev/null || whoami)
        echo "${GIT_USERNAME:-$git_user}"
        ;;
    *Password*)
        # Extract and return the GitHub token
        # Try to get token from gh auth status
        token=$(gh auth status --show-token 2>&1 | grep -oE 'gho_[a-zA-Z0-9]{36}|ghp_[a-zA-Z0-9]{36}' | head -1)
        
        if [ -z "$token" ]; then
            # Fallback: try to get token from gh config
            token=$(gh auth token 2>/dev/null)
        fi
        
        if [ -z "$token" ]; then
            echo "Error: Could not retrieve GitHub token" >&2
            exit 1
        fi
        
        echo "$token"
        ;;
    *)
        # Unknown prompt
        echo "Error: Unknown credential prompt: $1" >&2
        exit 1
        ;;
esac
