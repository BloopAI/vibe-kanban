# /commit

---
allowed-tools: Bash(*), Glob(*), Grep(*), Read(*), Write(*)
description: Intelligent git commit workflow with smart file staging, diff analysis, and automated push
---

Automate the complete git workflow: analyze changes, stage files intelligently, generate commit messages, and push to remote.

## Usage

```bash
# Auto-commit with intelligent analysis
/commit

# Commit with custom message prefix
/commit "feat: add user authentication"

# Commit specific changes only
/commit "fix: resolve payment bug" --files-only="src/payment/*"

# Commit without push
/commit "wip: work in progress" --no-push

# Dry run to see what would be committed
/commit --dry-run
```

## Features

### 🔍 Smart Change Analysis
- Analyzes staged and unstaged changes
- Detects file types and change patterns
- Identifies potentially sensitive files to exclude
- Suggests optimal commit scope

### 📁 Intelligent File Staging
- Automatically stages relevant files
- Excludes common unwanted files (logs, cache, temp, etc.)
- Handles new files intelligently
- Respects `.gitignore` patterns

### 📝 AI-Powered Commit Messages
- Generates descriptive commit messages based on changes
- Follows conventional commit format
- Includes co-author attribution per project standards
- Analyzes diff content for accurate descriptions

### 🚀 Automated Push
- Pushes to remote after successful commit
- Handles upstream branch setup
- Provides clear feedback on push status

## Automatic Execution

```bash
#!/bin/bash

# Parse command arguments
MESSAGE_PREFIX="$1"
FILES_ONLY="$2"
NO_PUSH="$3"
DRY_RUN="$4"

# Configuration
COAUTHOR="Co-Authored-By: Automagik Genie <genie@namastex.ai>"
EXCLUDE_PATTERNS=(
    "*.log" "*.tmp" "*.cache" "*.pyc" "__pycache__/*" 
    ".DS_Store" "*.swp" "*.swo" "node_modules/*"
    ".venv/*" "venv/*" "*.egg-info/*" "build/*" 
    "dist/*" ".pytest_cache/*" ".coverage"
    "*.backup" "*.bak" "*.orig"
)

echo "🔍 Analyzing repository changes..."

# Step 1: Check git status
echo "📊 Current git status:"
git status --porcelain

echo ""
echo "📋 Staged changes:"
git diff --cached --name-only

echo ""
echo "📋 Unstaged changes:"
git diff --name-only

echo ""
echo "📋 Untracked files:"
git ls-files --others --exclude-standard

# Step 2: Smart file staging
echo ""
echo "🎯 Smart file staging analysis..."

# Get all changed files (staged + unstaged + untracked)
ALL_FILES=($(git diff --cached --name-only))
ALL_FILES+=($(git diff --name-only))
ALL_FILES+=($(git ls-files --others --exclude-standard))

# Remove duplicates and sort
UNIQUE_FILES=($(printf '%s\n' "${ALL_FILES[@]}" | sort -u))

# Filter files intelligently
FILES_TO_STAGE=()
EXCLUDED_FILES=()

for file in "${UNIQUE_FILES[@]}"; do
    # Skip empty entries
    [[ -z "$file" ]] && continue
    
    # Check if file should be excluded
    EXCLUDE=false
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$file" == $pattern ]]; then
            EXCLUDE=true
            break
        fi
    done
    
    # Additional smart exclusions
    if [[ "$file" =~ \.(log|tmp|cache|pyc)$ ]] || \
       [[ "$file" =~ ^\..*\.swp$ ]] || \
       [[ "$file" =~ node_modules/ ]] || \
       [[ "$file" =~ __pycache__/ ]] || \
       [[ "$file" =~ \.venv/ ]] || \
       [[ "$file" =~ build/ ]] || \
       [[ "$file" =~ dist/ ]]; then
        EXCLUDE=true
    fi
    
    # Check if file exists (might be deleted)
    if [[ ! -f "$file" ]] && [[ ! -d "$file" ]]; then
        # File might be deleted, check git status
        if git status --porcelain | grep -q "^.D.*$file"; then
            EXCLUDE=false  # Include deleted files
        fi
    fi
    
    if [[ "$EXCLUDE" == true ]]; then
        EXCLUDED_FILES+=("$file")
        echo "🚫 Excluding: $file"
    else
        FILES_TO_STAGE+=("$file")
        echo "✅ Including: $file"
    fi
done

# Handle files-only filter
if [[ -n "$FILES_ONLY" ]]; then
    echo ""
    echo "🔍 Filtering files matching: $FILES_ONLY"
    FILTERED_FILES=()
    for file in "${FILES_TO_STAGE[@]}"; do
        if [[ "$file" == $FILES_ONLY ]]; then
            FILTERED_FILES+=("$file")
        fi
    done
    FILES_TO_STAGE=("${FILTERED_FILES[@]}")
fi

echo ""
echo "📁 Files to stage: ${#FILES_TO_STAGE[@]}"
for file in "${FILES_TO_STAGE[@]}"; do
    echo "  • $file"
done

# Step 3: Stage files (unless dry run)
if [[ "$DRY_RUN" != "--dry-run" ]]; then
    echo ""
    echo "⬆️ Staging files..."
    for file in "${FILES_TO_STAGE[@]}"; do
        git add "$file"
        echo "✅ Staged: $file"
    done
else
    echo ""
    echo "🔍 DRY RUN: Would stage ${#FILES_TO_STAGE[@]} files"
fi

# Step 4: Generate diff for commit message analysis
echo ""
echo "📝 Analyzing changes for commit message..."
DIFF_OUTPUT=$(git diff --cached --name-status 2>/dev/null || echo "")
DIFF_STATS=$(git diff --cached --stat 2>/dev/null || echo "")

echo "Changes summary:"
echo "$DIFF_STATS"

# Step 5: Generate intelligent commit message
echo ""
echo "🤖 Generating commit message..."

# Analyze changes by type
ADDED_FILES=($(echo "$DIFF_OUTPUT" | grep "^A" | cut -f2))
MODIFIED_FILES=($(echo "$DIFF_OUTPUT" | grep "^M" | cut -f2))
DELETED_FILES=($(echo "$DIFF_OUTPUT" | grep "^D" | cut -f2))
RENAMED_FILES=($(echo "$DIFF_OUTPUT" | grep "^R" | cut -f2))

# Determine change type and scope
CHANGE_TYPE="feat"
CHANGE_SCOPE=""
CHANGE_DESCRIPTION=""

# Analyze file patterns to determine type and scope
if [[ ${#ADDED_FILES[@]} -gt 0 ]] && [[ ${#MODIFIED_FILES[@]} -eq 0 ]]; then
    CHANGE_TYPE="feat"
    CHANGE_DESCRIPTION="add new functionality"
elif [[ ${#MODIFIED_FILES[@]} -gt 0 ]] && [[ ${#ADDED_FILES[@]} -eq 0 ]]; then
    CHANGE_TYPE="fix"
    CHANGE_DESCRIPTION="update existing functionality"
elif [[ ${#DELETED_FILES[@]} -gt 0 ]]; then
    CHANGE_TYPE="refactor"
    CHANGE_DESCRIPTION="remove unused code"
else
    CHANGE_TYPE="chore"
    CHANGE_DESCRIPTION="update codebase"
fi

# Determine scope from file paths
if [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ ai/agents/ ]]; then
    CHANGE_SCOPE="agents"
elif [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ ai/teams/ ]]; then
    CHANGE_SCOPE="teams"
elif [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ lib/knowledge/ ]]; then
    CHANGE_SCOPE="knowledge"
elif [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ lib/utils/ ]]; then
    CHANGE_SCOPE="utils"
elif [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ api/ ]]; then
    CHANGE_SCOPE="api"
elif [[ "${ADDED_FILES[*]} ${MODIFIED_FILES[*]}" =~ config ]]; then
    CHANGE_SCOPE="config"
fi

# Build commit message
if [[ -n "$MESSAGE_PREFIX" ]]; then
    COMMIT_MESSAGE="$MESSAGE_PREFIX"
else
    if [[ -n "$CHANGE_SCOPE" ]]; then
        COMMIT_MESSAGE="$CHANGE_TYPE($CHANGE_SCOPE): $CHANGE_DESCRIPTION"
    else
        COMMIT_MESSAGE="$CHANGE_TYPE: $CHANGE_DESCRIPTION"
    fi
    
    # Add specific details based on files
    if [[ ${#ADDED_FILES[@]} -gt 0 ]]; then
        COMMIT_MESSAGE+="\n\nAdded files:\n"
        for file in "${ADDED_FILES[@]:0:5}"; do  # Limit to first 5
            COMMIT_MESSAGE+="- $file\n"
        done
        [[ ${#ADDED_FILES[@]} -gt 5 ]] && COMMIT_MESSAGE+="- ... and $((${#ADDED_FILES[@]} - 5)) more files\n"
    fi
    
    if [[ ${#MODIFIED_FILES[@]} -gt 0 ]]; then
        COMMIT_MESSAGE+="\nModified files:\n"
        for file in "${MODIFIED_FILES[@]:0:5}"; do  # Limit to first 5
            COMMIT_MESSAGE+="- $file\n"
        done
        [[ ${#MODIFIED_FILES[@]} -gt 5 ]] && COMMIT_MESSAGE+="- ... and $((${#MODIFIED_FILES[@]} - 5)) more files\n"
    fi
    
    if [[ ${#DELETED_FILES[@]} -gt 0 ]]; then
        COMMIT_MESSAGE+="\nDeleted files:\n"
        for file in "${DELETED_FILES[@]:0:5}"; do  # Limit to first 5
            COMMIT_MESSAGE+="- $file\n"
        done
        [[ ${#DELETED_FILES[@]} -gt 5 ]] && COMMIT_MESSAGE+="- ... and $((${#DELETED_FILES[@]} - 5)) more files\n"
    fi
fi

echo "📝 Generated commit message:"
echo "----------------------------------------"
echo -e "$COMMIT_MESSAGE"
echo "----------------------------------------"
echo ""
echo "👥 Co-author: $COAUTHOR"

# Step 6: Create commit (unless dry run)
if [[ "$DRY_RUN" != "--dry-run" ]]; then
    echo ""
    echo "💾 Creating commit..."
    
    git commit -m "$(echo -e "$COMMIT_MESSAGE")" -m "" -m "$COAUTHOR"
    
    if [[ $? -eq 0 ]]; then
        echo "✅ Commit created successfully!"
        
        # Step 7: Push to remote (unless --no-push)
        if [[ "$NO_PUSH" != "--no-push" ]]; then
            echo ""
            echo "🚀 Pushing to remote..."
            
            CURRENT_BRANCH=$(git branch --show-current)
            echo "📍 Current branch: $CURRENT_BRANCH"
            
            # Check if upstream branch exists
            if git rev-parse --verify origin/$CURRENT_BRANCH >/dev/null 2>&1; then
                git push origin $CURRENT_BRANCH
            else
                echo "🆕 Setting upstream branch..."
                git push -u origin $CURRENT_BRANCH
            fi
            
            if [[ $? -eq 0 ]]; then
                echo "✅ Successfully pushed to remote!"
                echo "🌐 Changes are now available on: origin/$CURRENT_BRANCH"
            else
                echo "❌ Push failed. Please check remote repository access."
            fi
        else
            echo "⏸️ Skipping push (--no-push specified)"
        fi
    else
        echo "❌ Commit failed. Please check the changes and try again."
    fi
else
    echo ""
    echo "🔍 DRY RUN: Would create commit with message above"
fi

echo ""
echo "🏁 Git workflow complete!"
```

## Advanced Features

### Smart Exclusion Patterns
The command automatically excludes common unwanted files:
- **Temporary files**: `*.tmp`, `*.cache`, `*.log`, `*.pyc`
- **IDE files**: `.DS_Store`, `*.swp`, `*.swo`
- **Dependencies**: `node_modules/*`, `.venv/*`, `venv/*`
- **Build artifacts**: `build/*`, `dist/*`, `*.egg-info/*`
- **Test artifacts**: `.pytest_cache/*`, `.coverage`
- **Backup files**: `*.backup`, `*.bak`, `*.orig`

### Intelligent Change Detection
- **Added files**: Detects new functionality (`feat`)
- **Modified files**: Identifies bug fixes (`fix`) or updates
- **Deleted files**: Recognizes refactoring (`refactor`)
- **Mixed changes**: Categorizes as maintenance (`chore`)

### Scope Detection
Automatically determines scope from file paths:
- `ai/agents/*` → `agents`
- `ai/teams/*` → `teams` 
- `lib/knowledge/*` → `knowledge`
- `lib/utils/*` → `utils`
- `api/*` → `api`
- `*config*` → `config`

### Project Standards Integration
- **Co-authoring**: Automatically adds `Co-Authored-By: Automagik Genie <genie@namastex.ai>`
- **Conventional commits**: Follows `type(scope): description` format
- **Detailed descriptions**: Includes file lists for context

## Usage Examples

```bash
# Basic usage - analyzes all changes and commits
/commit

# Custom message with auto-staging
/commit "feat(agents): add new knowledge base system"

# Commit only specific files
/commit "fix(api): resolve endpoint timeout" --files-only="api/*"

# Commit without pushing (for review)
/commit "wip: implementing user dashboard" --no-push

# See what would be committed without doing it
/commit --dry-run
```

This command provides a complete, intelligent git workflow that handles the complexity of change analysis, smart file staging, and automated commit message generation while following your project's standards and conventions.