# Add option to create empty PRs to avoid leaking prompts

## Problem
When creating a PR, Vibe Kanban automatically populates the title and description from the task's first user message. This can inadvertently leak internal prompts or sensitive information to public repositories.

## Proposed Solution
Add a "Create empty PR" checkbox to the PR creation dialog that:
- Creates PRs with empty title/description when checked
- Persists the checkbox state between dialog opens
- Defaults to unchecked (current behavior)
- Is mutually exclusive with "Auto-generate description"

## Use Case
Users working on public repositories can enable this option once to ensure all PRs are created empty, then manually add descriptions that don't reveal internal prompts.

## Implementation Note
This issue has already been addressed in PR #[PR_NUMBER] (to be filled in when creating the PR).
