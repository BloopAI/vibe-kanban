#!/usr/bin/env bash

# scripts/release/release.sh
#
# This script provides functionalities for Git release management,
# including determining release type, calculating next version, generating changelogs,
# updating version files, creating tags, generating release notes, and creating GitHub releases.
# It adheres to strict shell mode and emits standardized JSON output.

# Strict mode: E = error, u = unset variables, o pipefail = pipeline errors
set -Eeuo pipefail

# Source common functions and libraries
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/git.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/json.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/compat.sh" # For cross-platform commands

# --- Functions ---

# Function to determine release type (major, minor, patch) based on conventional commits
determine_release_type() {
    log_info "Determining release type based on commits..."
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
    log_info "Last release: ${last_tag}"
    
    local commits_since_tag=$(git log "${last_tag}"..HEAD --oneline)
    local release_type="patch" # Default to patch

    if echo "$commits_since_tag" | grep -q "BREAKING CHANGE" || echo "$commits_since_tag" | grep -q "^[a-f0-9]* feat"; then
        release_type="minor"
    fi
    if echo "$commits_since_tag" | grep -q "BREAKING CHANGE"; then
        release_type="major"
    fi
    
    json_ok "Release type determined." \
        "release_type" "$release_type" \
        "last_tag" "$last_tag"
}

# Function to calculate the next semantic version
calculate_next_version() {
    local current_version=$1
    local release_type=$2
    
    log_info "Calculating next version for ${current_version} (${release_type} release)..."

    # Remove 'v' prefix if present
    local version=${current_version#v}
    IFS='.' read -r major minor patch <<< "$version"
    
    # Increment based on release type
    case "$release_type" in
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "patch")
            patch=$((patch + 1))
            ;;
        *)
            json_err "Invalid release type: ${release_type}. Supported: major, minor, patch."
            exit 1
            ;;
    esac
    
    local next_version="v${major}.${minor}.${patch}"
    json_ok "Next version calculated." \
        "next_version" "$next_version"
}

# Function to create a release branch (optional for formal processes)
create_release_branch() {
    local version=$1
    local branch_name="release/${version}"
    
    log_info "Creating release branch: ${branch_name} from main..."
    
    git checkout main || { json_err "Failed to checkout main branch."; exit 1; }
    git pull origin main || { json_err "Failed to pull latest from origin/main."; exit 1; }
    git checkout -b "${branch_name}" || { json_err "Failed to create release branch: ${branch_name}."; exit 1; }
    
    json_ok "Release branch created." \
        "branch_name" "$branch_name"
}

# Function to generate changelog based on conventional commits
generate_changelog() {
    local last_tag=$1
    local next_version=$2
    local changelog_file="CHANGELOG.md"
    local temp_changelog_file=$(mktemp)

    log_info "Generating changelog for ${next_version} since ${last_tag}..."
    
    # Generate changelog header
    echo "# Changelog for ${next_version}" > "${temp_changelog_file}"
    echo "" >> "${temp_changelog_file}"
    echo "## [${next_version}] - $(date +%Y-%m-%d)" >> "${temp_changelog_file}"
    echo "" >> "${temp_changelog_file}"
    
    # Group commits by type
    log_info "Adding Features to changelog..."
    echo "### Features" >> "${temp_changelog_file}"
    git log "${last_tag}"..HEAD --grep="^feat" --pretty=format:"- %s (%h)" >> "${temp_changelog_file}"
    echo -e "\n" >> "${temp_changelog_file}"
    
    log_info "Adding Bug Fixes to changelog..."
    echo "### Bug Fixes" >> "${temp_changelog_file}"
    git log "${last_tag}"..HEAD --grep="^fix" --pretty=format:"- %s (%h)" >> "${temp_changelog_file}"
    echo -e "\n" >> "${temp_changelog_file}"
    
    log_info "Adding Documentation changes to changelog..."
    echo "### Documentation" >> "${temp_changelog_file}"
    git log "${last_tag}"..HEAD --grep="^docs" --pretty=format:"- %s (%h)" >> "${temp_changelog_file}"
    echo -e "\n" >> "${temp_changelog_file}"
    
    log_info "Adding Chores to changelog..."
    echo "### Chores" >> "${temp_changelog_file}"
    git log "${last_tag}"..HEAD --grep="^chore" --pretty=format:"- %s (%h)" >> "${temp_changelog_file}"
    echo -e "\n" >> "${temp_changelog_file}"
    
    # Breaking changes section
    local breaking_changes=$(git log "${last_tag}"..HEAD --grep="BREAKING CHANGE" --pretty=format:"- %B" | grep -A 10 "BREAKING CHANGE")
    if [ -n "$breaking_changes" ]; then
        log_warn "Breaking changes detected. Adding to changelog."
        echo "### ⚠️ BREAKING CHANGES" >> "${temp_changelog_file}"
        echo "$breaking_changes" >> "${temp_changelog_file}"
        echo -e "\n" >> "${temp_changelog_file}"
    fi
    
    # Prepend to existing changelog or create new
    if [ -f "$changelog_file" ]; then
        cat "${temp_changelog_file}" "$changelog_file" > new_changelog.md
        mv new_changelog.md "$changelog_file"
    else
        mv "${temp_changelog_file}" "$changelog_file"
    fi
    
    rm -f "${temp_changelog_file}"
    json_ok "Changelog generated successfully." \
        "changelog_file" "$changelog_file"
}

# Function to update version in various project files
update_version_files() {
    local version=$1
    # Remove 'v' prefix for file updates
    local version_number=${version#v}
    
    log_info "Updating version files to ${version_number}..."

    # Update package.json if exists
    if [ -f "package.json" ]; then
        # Use sed to update version
        sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"${version_number}\"/" package.json
        rm package.json.bak
        log_info "Updated package.json"
    fi
    
    # Update package-lock.json if exists
    if [ -f "package-lock.json" ]; then
        npm install --package-lock-only || log_warn "Failed to update package-lock.json. Manual intervention may be needed."
        log_info "Updated package-lock.json"
    fi
    
    # Update version.txt if exists
    if [ -f "version.txt" ]; then
        echo "${version_number}" > version.txt
        log_info "Updated version.txt"
    fi
    
    # Update HoliCode framework version in projectbrief.md if exists
    if [ -f ".holicode/state/projectbrief.md" ]; then
        sed -i.bak "s/version: \"[^\"]*\"/version: \"${version_number}\"/" .holicode/state/projectbrief.md
        rm .holicode/state/projectbrief.md.bak
        log_info "Updated .holicode/state/projectbrief.md"
    fi

    json_ok "Version files updated." \
        "version" "$version_number"
}

# Function to commit release changes
commit_release_changes() {
    local version=$1
    log_info "Committing release changes for ${version}..."
    
    # Stage all version-related changes
    git add CHANGELOG.md || true
    git add package.json package-lock.json 2>/dev/null || true
    git add version.txt 2>/dev/null || true
    git add .holicode/state/projectbrief.md 2>/dev/null || true
    
    # Commit with conventional format
    git commit -m "chore(release): ${version}

- Updated changelog
- Bumped version numbers
- Prepared release artifacts" || {
        json_err "Failed to commit release changes. Check if there are changes to commit."
        exit 1
    }
    json_ok "Release changes committed." \
        "version" "$version"
}

# Function to create and push release tag
create_release_tag() {
    local version=$1
    local message="Release ${version}"
    
    log_info "Creating annotated tag: ${version}..."
    git tag -a "$version" -m "$message" || {
        json_err "Failed to create tag: ${version}. Tag might already exist."
        exit 1
    }
    
    log_info "Pushing tag to remote: ${version}..."
    git push origin "$version" || {
        json_err "Failed to push tag: ${version}. Check remote connection or permissions."
        exit 1
    }
    json_ok "Release tag created and pushed." \
        "tag" "$version"
}

# Function to generate release notes for GitHub
generate_release_notes() {
    local version=$1
    local last_tag=$2
    local release_notes_file="release_notes.md"
    
    log_info "Generating release notes for GitHub for ${version}..."

    # Extract relevant section from changelog
    # Using sed to extract content between "## [version]" and the next "## ["
    local changelog_section=$(sed -n "/^## \[${version}\]/,/^## \[/p" CHANGELOG.md | sed '$d' | tail -n +2)
    
    cat > "${release_notes_file}" << EOF
# Release ${version}

${changelog_section}

## Installation
\`\`\`bash
# Using npm
npm install @holicode/framework@${version}

# Using git
git clone --branch ${version} $(git remote get-url origin 2>/dev/null || echo "https://github.com/your-org/your-repo.git")
\`\`\`

## Contributors
$(git log "${last_tag}"..HEAD --pretty=format:"- @%an" | sort -u)

## Full Changelog
[View all changes]($(git remote get-url origin 2>/dev/null || echo "https://github.com/your-org/your-repo")/compare/${last_tag}...${version})
EOF
    
    json_ok "Release notes generated." \
        "release_notes_file" "$release_notes_file"
}

# Function to create GitHub Release using gh CLI
create_github_release() {
    local version=$1
    local prerelease=${2:-false}
    local release_notes_file="release_notes.md"

    if [ ! -f "${release_notes_file}" ]; then
        json_err "Release notes file '${release_notes_file}' not found. Generate it first."
        exit 1
    fi
    
    log_info "Creating GitHub release for ${version} (prerelease: ${prerelease})..."

    if [ "$prerelease" = "true" ]; then
        gh release create "$version" \
            --title "Release $version" \
            --notes-file "${release_notes_file}" \
            --prerelease || {
            json_err "Failed to create GitHub prerelease."
            exit 1
        }
    else
        gh release create "$version" \
            --title "Release $version" \
            --notes-file "${release_notes_file}" || {
            json_err "Failed to create GitHub release."
            exit 1
        }
    fi
    json_ok "GitHub release created." \
        "version" "$version"
}

# Function to trigger deployment workflow
trigger_deployment() {
    local version=$1
    local environment=${2:-staging}
    
    log_info "Triggering deployment of ${version} to ${environment}..."
    
    # Trigger GitHub Actions deployment workflow
    gh workflow run deploy.yml \
        -f version="$version" \
        -f environment="$environment" || {
        json_err "Failed to trigger GitHub Actions deployment workflow. Check workflow file and permissions."
        exit 1
    }
    
    json_ok "Deployment triggered." \
        "version" "$version" \
        "environment" "$environment"
}

# --- Main execution logic ---
_main() {
    if [ "$#" -eq 0 ]; then
        json_err "No command provided. Usage: release.sh <command> [<args>...]" \
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
