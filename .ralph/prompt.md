# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

---

## CRITICAL: Context Recovery (Run After Every Compaction)

Since conversation history is compacted, you MUST fetch context before starting work.

**Execute these steps in order:**

### Step 1: Read Project Instructions
```
Read CLAUDE.md
```
This contains critical project-specific rules and conventions.

### Step 2: Read the PRD and Check State
```
Read prd.json
```

**Check the `started` field first:**
- If `started: false` → This is the **first iteration**. You must set `started: true` before beginning work.
- If `started: true` → This is a subsequent iteration. Continue normally.

**Then check for mid-story recovery:**
1. If ANY story has `inProgress: true`, you are **recovering from a crash/compaction mid-story**
   - Find that story - this is what you were working on
   - Read progress.txt to see what was already done
   - **Continue from where you left off** - don't restart the story

2. If NO story has `inProgress: true`, find the **first** story where `passes: false`
   - This is your next story to implement

### Step 3: Read Progress Log
```
Read progress.txt
```
**Check the `## Codebase Patterns` section FIRST** - these are learnings from previous iterations that take precedence.

### Step 4: Read Reference Documentation
```
Read any .md reference files in .ralph/ directory for context.
```


---

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Read any .md reference files in the same directory for context
4. Verify you're on the correct branch from PRD `branchName`
5. **If `started: false`** → Set `started: true` in prd.json (this marks the transition to autonomous execution)
6. Identify your target story:
   - If a story has `inProgress: true` → **resume that story** (you're recovering)
   - Otherwise → pick the **first** story where `passes: false`
7. **Mark story as in-progress** (skip if already `inProgress: true`):
   - Update prd.json to set `inProgress: true` on your target story
   - Commit this change: `chore: start [Story ID]`
8. Implement that single user story
9. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
10. Update AGENTS.md files if you discover reusable patterns (see below)
11. If checks pass:
    - Commit implementation: `feat: [Story ID] - [Story Title]`
    - Update prd.json: set `passes: true` AND `inProgress: false`
    - Append progress to progress.txt
12. **Check if this was a checkpoint story:**
    - If `checkpoint: true` on the completed story → **STOP HERE**
    - Provide a summary of all work completed so far
    - Do NOT continue to the next story (user will review and continue manually)

---

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

---

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

---

## Update AGENTS.md Files

Before committing, check if any edited files have learnings worth preserving in nearby AGENTS.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing AGENTS.md** - Look for AGENTS.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good AGENTS.md additions:**
- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update AGENTS.md if you have **genuinely reusable knowledge** that would help future work in that directory.

---

## Quality Requirements

- ALL commits must pass your project's quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

---

## Browser Testing (Required for Frontend Stories)

For any story that changes UI, you MUST verify it works in the browser:

1. Load the `dev-browser` skill
2. Navigate to the relevant page
3. Verify the UI changes work as expected
4. Take a screenshot if helpful for the progress log

A frontend story is NOT complete until browser verification passes.

---

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing:

1. **Archive the completed PRD files:**
   - Create archive folder: `.ralph/archive/{YYYY-MM-DD}-{feature-name}/`
   - Move `prd.json` and `prd-*.md` files to the archive folder
   - Move `progress.txt` to the archive folder
   - Example: `.ralph/archive/2026-01-23-iteration-prompt-improvements/`

2. **Reply with completion signal:**
   ```
   <promise>COMPLETE</promise>
   ```

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

**Note:** The `.ralph/archive/` folder is gitignored - archives are for local reference only.

---

## Checkpoint Stories

Some stories have `checkpoint: true` - these are **review points**.

When you complete a checkpoint story:
1. Complete it normally (passes: true, inProgress: false, commit, update progress)
2. **Provide a summary** of work done across all completed stories so far
3. **STOP and wait** - do NOT proceed to the next story

The user will:
- Review your work
- Ask questions or request clarifications (you'll respond in the same session)
- Click "Continue" when ready to proceed (this starts a fresh session)

**Checkpoint summary format:**
```
Checkpoint Review: [Story ID]

Completed So Far:
- [Story ID]: [Brief description of what was implemented]
- [Story ID]: [Brief description]
...

Key Decisions Made:
- [Decision 1 and rationale]
- [Decision 2 and rationale]

Files Modified:
- [List of key files changed]

Ready for Review:
[Any specific things you want the user to verify or test]
```

---

## PRD Field Reference

### Top-level fields

| Field | Type | Purpose |
|-------|------|---------|
| `started` | boolean | `false` = interactive phase (user designing PRD), `true` = autonomous execution phase |
| `iterationPrompt` | string (optional) | Custom prompt for autonomous iterations. Default: "Read .ralph/prompt.md and continue implementing the PRD." |

**First iteration:** When you see `started: false`, set it to `true`. This signals the system to use `iterationPrompt` for subsequent sessions instead of the original task description.

### Story-level fields

| Field | Type | Purpose |
|-------|------|---------|
| `passes` | boolean | Story implementation complete and verified |
| `inProgress` | boolean | Agent is actively working on this story (for crash recovery) |
| `checkpoint` | boolean | Pause for user review after completing this story |

**State transitions:**
- First iteration: `started: false` → `started: true`
- Starting a story: `inProgress: true`
- Completing a story: `passes: true, inProgress: false`
- Never set both `inProgress: true` AND `passes: true`

---

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
