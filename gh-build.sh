#!/bin/bash

# GitHub Actions Build Helper for automagik-forge
# Usage: ./gh-build.sh [command]
# Commands:
#   trigger - Manually trigger workflow
#   monitor [run_id] - Monitor a workflow run
#   download [run_id] - Download artifacts from a run
#   publish [type] - Publish management (check|manual|auto)
#   publish - Interactive Claude-powered release pipeline
#   beta - Auto-incremented beta release pipeline
#   status - Show latest workflow status

set -e

REPO="namastexlabs/automagik-forge"
WORKFLOW_FILE=".github/workflows/build-all-platforms.yml"

case "${1:-status}" in
    trigger)
        echo "🚀 Triggering GitHub Actions build..."
        gh workflow run "$WORKFLOW_FILE" --repo "$REPO"
        
        echo "⏳ Waiting for workflow to start..."
        sleep 5
        
        # Get the latest run
        RUN_ID=$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')
        
        if [ -z "$RUN_ID" ]; then
            echo "❌ Failed to get workflow run ID"
            exit 1
        fi
        
        echo "📋 Workflow run ID: $RUN_ID"
        echo "🔗 View in browser: https://github.com/$REPO/actions/runs/$RUN_ID"
        echo ""
        echo "Run './gh-build.sh monitor $RUN_ID' to monitor progress"
        ;;
        
    publish-status)
        PUBLISH_TYPE="${2:-check}"
        
        case "$PUBLISH_TYPE" in
            check)
                echo "📊 Checking publish status..."
                echo ""
                echo "Latest NPM package version:"
                npm view automagik-forge version 2>/dev/null || echo "  (Package not found or not published)"
                echo ""
                echo "Current local version:"
                cat package.json | grep '"version"' | cut -d'"' -f4
                echo ""
                echo "Latest GitHub release:"
                gh release list --repo "$REPO" --limit 1 | head -1 || echo "  (No releases found)"
                echo ""
                echo "Recent workflow runs:"
                gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 3
                ;;
                
            manual)
                echo "🚀 Manual NPM publish (requires NPM_TOKEN)..."
                
                # Check if we have artifacts from a successful build
                LATEST_RUN=$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --status success --limit 1 --json databaseId --jq '.[0].databaseId')
                
                if [ -z "$LATEST_RUN" ]; then
                    echo "❌ No successful workflow runs found. Run './gh-build.sh trigger' first."
                    exit 1
                fi
                
                echo "📥 Downloading artifacts from successful run $LATEST_RUN..."
                OUTPUT_DIR="publish-temp"
                rm -rf "$OUTPUT_DIR"
                mkdir -p "$OUTPUT_DIR"
                
                gh run download "$LATEST_RUN" --repo "$REPO" --dir "$OUTPUT_DIR"
                
                # Reorganize artifacts like the workflow does
                cd "$OUTPUT_DIR"
                for dir in binaries-*; do
                    if [ -d "$dir" ]; then
                        platform=${dir#binaries-}
                        mkdir -p "../npx-cli/dist/$platform"
                        mv "$dir"/* "../npx-cli/dist/$platform/" 2>/dev/null || true
                    fi
                done
                cd ..
                rm -rf "$OUTPUT_DIR"
                
                echo "📦 Publishing to NPM..."
                if [ -z "$NPM_TOKEN" ]; then
                    echo "⚠️  NPM_TOKEN not set. Make sure you're logged in: npm login"
                    echo "   Or set NPM_TOKEN environment variable"
                fi
                
                cd npx-cli
                npm publish
                echo "✅ Published to NPM!"
                ;;
                
            auto)
                echo "🔄 Waiting for automatic publish via GitHub Actions..."
                
                # Find the most recent tag-triggered run
                TAG_RUN=$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --event push --limit 5 --json databaseId,headBranch,event --jq '.[] | select(.headBranch | startswith("refs/tags/")) | .databaseId' | head -1)
                
                if [ -z "$TAG_RUN" ]; then
                    echo "❌ No recent tag-triggered runs found"
                    echo "💡 Try: git tag v0.x.y && git push origin v0.x.y"
                    exit 1
                fi
                
                echo "📋 Monitoring tag-based run: $TAG_RUN"
                ./gh-build.sh monitor "$TAG_RUN"
                ;;
                
            *)
                echo "❌ Unknown publish command: $PUBLISH_TYPE"
                echo "Usage: ./gh-build.sh publish [check|manual|auto]"
                echo "  check  - Check current publish status"
                echo "  manual - Manually publish after downloading artifacts"
                echo "  auto   - Monitor automatic publish from tag push"
                exit 1
                ;;
        esac
        ;;
        
    publish)
        echo "🚀 Starting interactive publishing pipeline..."
        
        # Get current version from package.json
        VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
        if [ -z "$VERSION" ]; then
            echo "❌ Could not determine version from package.json"
            exit 1
        fi
        
        echo "📋 Publishing version: $VERSION"
        
        # Get commits since last tag for Claude
        LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
        if [ -z "$LAST_TAG" ]; then
            COMMITS=$(git log --pretty=format:"- %s (%an)" -10)
            echo "📝 No previous tags found, using last 10 commits"
        else
            COMMITS=$(git log $LAST_TAG..HEAD --pretty=format:"- %s (%an)")
            echo "📝 Generating notes since $LAST_TAG"
        fi
        
        if [ -z "$COMMITS" ]; then
            echo "❌ No new commits found since last tag!"
            echo "💡 Did you forget to commit your changes?"
            exit 1
        fi
        
        # Create Claude prompt with Agno-style template
        CLAUDE_PROMPT="Generate professional GitHub release notes for automagik-forge version $VERSION using this Agno-style template:

## New Features
[List major new functionality and capabilities]

## Improvements  
[List enhancements, optimizations, and developer experience improvements]

## Bug Fixes
[List bug fixes and stability improvements]

## What's Changed
[List technical changes and implementation details]

Based on these commits:
$COMMITS

Focus on:
- User-facing benefits
- Technical improvements
- Developer workflow enhancements
- Be concise but informative
- Use bullet points with clear descriptions"

        # Try to generate with Claude, fall back to template
        echo "🤖 Generating release notes..."
        if command -v claude >/dev/null 2>&1; then
            CLAUDE_OUTPUT=$(claude -p "$CLAUDE_PROMPT" --output-format json 2>/dev/null) || true
            if [ -n "$CLAUDE_OUTPUT" ]; then
                CONTENT=$(echo "$CLAUDE_OUTPUT" | jq -r '.result' 2>/dev/null)
                SESSION_ID=$(echo "$CLAUDE_OUTPUT" | jq -r '.session_id' 2>/dev/null)
            fi
        fi
        
        # If Claude failed or isn't available, generate from template
        if [ -z "$CONTENT" ] || [ "$CONTENT" = "null" ]; then
            echo "📝 Using template-based release notes..."
            CONTENT="## Release v$VERSION

## What's Changed
$COMMITS

## Summary
This release includes various improvements and bug fixes.

---
*Full Changelog*: https://github.com/$REPO/compare/$LAST_TAG...v$VERSION"
        fi
        
        # Save initial content
        echo "$CONTENT" > .release-notes-draft.md
        
        # Interactive loop with keyboard selection
        while true; do
            clear
            echo "═══════════════════════════════════════════════════════════════"
            echo "📋 Generated Release Notes for v$VERSION"
            echo "═══════════════════════════════════════════════════════════════"
            echo ""
            cat .release-notes-draft.md
            echo ""
            echo "═══════════════════════════════════════════════════════════════"
            echo ""
            
            PS3="Choose an action: "
            select choice in "✅ Accept and continue" "✏️  Edit manually" "🔄 Regenerate with feedback" "❌ Cancel release"; do
                case $choice in
                    "✅ Accept and continue")
                        echo "✅ Release notes accepted!"
                        break 2
                        ;;
                    "✏️  Edit manually")
                        echo "🖊️  Opening release notes in editor..."
                        ${EDITOR:-nano} .release-notes-draft.md
                        break
                        ;;
                    "🔄 Regenerate with feedback")
                        echo ""
                        echo "Enter feedback for Claude (or press Enter for different style):"
                        read -r feedback
                        
                        if [ -n "$feedback" ]; then
                            FEEDBACK_PROMPT="$feedback"
                        else
                            FEEDBACK_PROMPT="Generate the release notes again but make them more technical and detailed, focusing on specific implementation changes and developer benefits."
                        fi
                        
                        echo "🤖 Regenerating with feedback..."
                        if [ "$SESSION_ID" != "null" ] && [ -n "$SESSION_ID" ]; then
                            CLAUDE_OUTPUT=$(claude -p "$FEEDBACK_PROMPT" --resume "$SESSION_ID" --output-format json 2>/dev/null) || {
                                echo "⚠️  Session continuation failed, generating fresh notes..."
                                CLAUDE_OUTPUT=$(claude -p "$CLAUDE_PROMPT

Additional context: $FEEDBACK_PROMPT" --output-format json 2>/dev/null)
                            }
                        else
                            CLAUDE_OUTPUT=$(claude -p "$CLAUDE_PROMPT

Additional context: $FEEDBACK_PROMPT" --output-format json 2>/dev/null)
                        fi
                        
                        NEW_CONTENT=$(echo "$CLAUDE_OUTPUT" | jq -r '.result')
                        if [ -n "$NEW_CONTENT" ] && [ "$NEW_CONTENT" != "null" ]; then
                            echo "$NEW_CONTENT" > .release-notes-draft.md
                            SESSION_ID=$(echo "$CLAUDE_OUTPUT" | jq -r '.session_id')
                            echo "✅ Release notes regenerated!"
                        else
                            echo "❌ Failed to regenerate release notes"
                        fi
                        break
                        ;;
                    "❌ Cancel release")
                        echo "❌ Release cancelled by user"
                        rm -f .release-notes-draft.md
                        exit 1
                        ;;
                    *)
                        echo "❌ Invalid choice. Please select 1-4."
                        ;;
                esac
            done
        done
        
        # Create GitHub release
        echo "🏗️  Creating GitHub release..."
        gh release create "v$VERSION" --title "Release v$VERSION" --notes-file .release-notes-draft.md || {
            echo "❌ Failed to create GitHub release"
            echo "💡 Make sure you have 'gh' CLI installed and authenticated"
            rm -f .release-notes-draft.md
            exit 1
        }
        
        echo "✅ GitHub release created: https://github.com/$REPO/releases/tag/v$VERSION"
        
        # Create and push git tag
        echo "🏷️  Creating and pushing git tag..."
        git tag "v$VERSION" 2>/dev/null || echo "⚠️  Tag v$VERSION already exists"
        git push origin "v$VERSION"
        
        # Cleanup draft
        rm -f .release-notes-draft.md
        
        # Trigger and monitor GitHub Actions build
        echo ""
        echo "⏳ Triggering and monitoring GitHub Actions build..."
        
        # Get the latest run ID after tag push
        sleep 5  # Wait for workflow to start
        RUN_ID=$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')
        
        if [ -n "$RUN_ID" ]; then
            echo "📋 Monitoring build run: $RUN_ID"
            echo "🔗 View in browser: https://github.com/$REPO/actions/runs/$RUN_ID"
            echo ""
            
            # Monitor the build automatically
            ./gh-build.sh monitor "$RUN_ID"
        else
            echo "⚠️  Could not find triggered build, monitoring latest..."
            ./gh-build.sh monitor
        fi
        ;;
        
    beta)
        echo "🧪 Starting beta release pipeline..."
        
        # Get current version from package.json (base version)
        BASE_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
        if [ -z "$BASE_VERSION" ]; then
            echo "❌ Could not determine version from package.json"
            exit 1
        fi
        
        # Check NPM for existing beta versions and auto-increment
        echo "🔍 Checking for existing beta versions..."
        EXISTING_BETAS=$(npm view automagik-forge versions --json 2>/dev/null | jq -r ".[]" 2>/dev/null | grep "^$BASE_VERSION-beta\." || echo "")
        
        if [ -z "$EXISTING_BETAS" ]; then
            BETA_NUMBER=1
            echo "📝 No existing betas found, starting with beta.1"
        else
            LAST_BETA=$(echo "$EXISTING_BETAS" | sort -V | tail -1)
            BETA_NUMBER=$(echo "$LAST_BETA" | sed "s/$BASE_VERSION-beta\.//" | awk '{print $1+1}')
            echo "📝 Found existing betas, incrementing to beta.$BETA_NUMBER"
        fi
        
        BETA_VERSION="$BASE_VERSION-beta.$BETA_NUMBER"
        echo "🎯 Publishing beta version: $BETA_VERSION"
        
        # Get recent commits for simple release notes
        COMMITS=$(git log --oneline -5 | sed 's/^/- /')
        
        # Create simple beta release notes
        BETA_NOTES="# Beta Release $BETA_VERSION

## 🧪 Pre-release for Testing

This is a beta release for testing upcoming features in v$BASE_VERSION.

## Recent Changes
$COMMITS

**⚠️ This is a pre-release version intended for testing. Use with caution in production.**

Install with: \`npx automagik-forge@beta\`"
        
        # Save beta notes
        echo "$BETA_NOTES" > .beta-release-notes.md
        
        echo "📋 Beta release notes:"
        echo "═══════════════════════════════════════════════════════════════"
        cat .beta-release-notes.md
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        
        # Confirm beta release
        read -p "Proceed with beta release $BETA_VERSION? [Y/n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "❌ Beta release cancelled"
            rm -f .beta-release-notes.md
            exit 1
        fi
        
        # Create GitHub pre-release
        echo "🏗️  Creating GitHub pre-release..."
        gh release create "v$BETA_VERSION" --title "Beta v$BETA_VERSION" --notes-file .beta-release-notes.md --prerelease || {
            echo "❌ Failed to create GitHub pre-release"
            rm -f .beta-release-notes.md
            exit 1
        }
        
        echo "✅ GitHub pre-release created: https://github.com/$REPO/releases/tag/v$BETA_VERSION"
        
        # Create and push git tag
        echo "🏷️  Creating and pushing git tag..."
        git tag "v$BETA_VERSION" 2>/dev/null || echo "⚠️  Tag v$BETA_VERSION already exists"
        git push origin "v$BETA_VERSION"
        
        # Cleanup
        rm -f .beta-release-notes.md
        
        # Monitor GitHub Actions build
        echo ""
        echo "⏳ Triggering and monitoring GitHub Actions build..."
        
        # Wait for workflow to start
        sleep 5
        RUN_ID=$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')
        
        if [ -n "$RUN_ID" ]; then
            echo "📋 Monitoring build run: $RUN_ID"
            echo "🔗 View in browser: https://github.com/$REPO/actions/runs/$RUN_ID"
            echo ""
            echo "💡 Beta will be published to NPM with 'beta' tag after successful build"
            echo "💡 Install with: npx automagik-forge@beta"
            echo ""
            
            # Monitor the build automatically
            ./gh-build.sh monitor "$RUN_ID"
        else
            echo "⚠️  Could not find triggered build, monitoring latest..."
            ./gh-build.sh monitor
        fi
        ;;
        
    monitor)
        RUN_ID="${2:-$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')}"
        
        if [ -z "$RUN_ID" ]; then
            echo "❌ No run ID provided and couldn't find latest run"
            echo "Usage: ./gh-build.sh monitor [run_id]"
            exit 1
        fi
        
        echo "📊 Monitoring workflow run $RUN_ID..."
        echo "🔗 View in browser: https://github.com/$REPO/actions/runs/$RUN_ID"
        echo "Press Ctrl+C to stop monitoring"
        echo ""
        
        while true; do
            STATUS=$(gh run view "$RUN_ID" --repo "$REPO" --json status --jq '.status')
            
            # Get job statuses
            echo -n "[$(date +%H:%M:%S)] "
            
            case "$STATUS" in
                completed)
                    CONCLUSION=$(gh run view "$RUN_ID" --repo "$REPO" --json conclusion --jq '.conclusion')
                    case "$CONCLUSION" in
                        success)
                            echo "✅ Workflow completed successfully!"
                            echo "🔗 View details: https://github.com/$REPO/actions/runs/$RUN_ID"
                            ;;
                        failure)
                            echo "❌ Workflow failed"
                            echo "🔗 View details: https://github.com/$REPO/actions/runs/$RUN_ID"
                            echo ""
                            echo "Failed jobs:"
                            FAILED_JOBS=$(gh run view "$RUN_ID" --repo "$REPO" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .databaseId')
                            
                            for JOB_ID in $FAILED_JOBS; do
                                JOB_NAME=$(gh run view "$RUN_ID" --repo "$REPO" --json jobs --jq ".jobs[] | select(.databaseId == $JOB_ID) | .name")
                                echo ""
                                echo "❌ $JOB_NAME"
                                echo "View logs: gh run view $RUN_ID --job $JOB_ID --log-failed"
                                
                                # Show last 20 lines of error
                                echo ""
                                echo "Last error lines:"
                                gh run view "$RUN_ID" --repo "$REPO" --job "$JOB_ID" --log-failed 2>/dev/null | tail -20 || echo "  (Could not fetch error details)"
                            done
                            ;;
                        cancelled)
                            echo "🚫 Workflow cancelled"
                            ;;
                        *)
                            echo "⚠️ Workflow completed with status: $CONCLUSION"
                            ;;
                    esac
                    break
                    ;;
                in_progress|queued|pending)
                    echo "🔄 Status: $STATUS"
                    gh run view "$RUN_ID" --repo "$REPO" --json jobs --jq '.jobs[] | "    \(.name): \(.status)"'
                    sleep 60
                    ;;
                *)
                    echo "❓ Unknown status: $STATUS"
                    break
                    ;;
            esac
        done
        ;;
        
    download)
        RUN_ID="${2:-$(gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')}"
        
        if [ -z "$RUN_ID" ]; then
            echo "❌ No run ID provided and couldn't find latest run"
            echo "Usage: ./gh-build.sh download [run_id]"
            exit 1
        fi
        
        echo "📥 Downloading artifacts from run $RUN_ID..."
        
        OUTPUT_DIR="gh-artifacts"
        rm -rf "$OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
        
        gh run download "$RUN_ID" --repo "$REPO" --dir "$OUTPUT_DIR"
        
        echo "✅ Downloaded to $OUTPUT_DIR/"
        echo ""
        echo "📦 Contents:"
        ls -la "$OUTPUT_DIR/"
        ;;
        
    status|*)
        echo "📊 Latest workflow status:"
        gh run list --workflow="$WORKFLOW_FILE" --repo "$REPO" --limit 5
        echo ""
        echo "Commands:"
        echo "  ./gh-build.sh trigger         - Manually trigger workflow"
        echo "  ./gh-build.sh monitor [id]    - Monitor latest/specific run"
        echo "  ./gh-build.sh download [id]   - Download artifacts"
        echo "  ./gh-build.sh publish [type]  - Publish management:"
        echo "    - check   - Check current publish status"
        echo "    - manual  - Manually publish from artifacts"  
        echo "    - auto    - Monitor automatic tag-based publish"
        echo "  ./gh-build.sh publish         - Interactive Claude-powered release"
        echo "  ./gh-build.sh beta            - Auto-incremented beta release"
        echo "  ./gh-build.sh status          - Show this status"
        ;;
esac