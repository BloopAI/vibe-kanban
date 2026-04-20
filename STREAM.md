# STREAM.md

## Stream Identifier

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Working mode: local-only VK maintenance worktree

## Objective

- Keep this worktree aligned with the current local-only VK stability baseline while the next branch-specific task is established.

## In Scope

- Truthful branch-local continuity for this worktree
- Verifying the checked-out branch state against `staging`
- Preserving the local-only runtime baseline

## Out of Scope

- Reconstructing the old backup-retention branch context as if it were still checked out here
- Inventing new branch-local feature scope without explicit task direction
- Re-enabling shared/cloud API behavior

## Stream-Specific Decisions

- This worktree currently has no branch-local code delta relative to `staging`.
- The checked-out tip is `88c0ebd59` (`fix: stop workspace status polling churn`).
- Local runtime expectations from `STATE.md` remain in force, including `shared_api_base: null`.
- Any new implementation work should either start from this clean baseline or move to a fresh task branch with updated continuity notes.

## Relevant Files / Modules

- `STREAM.md`
- `HANDOFF.md`
- `DELTA.md`
- `STATE.md`
- `packages/web-core/src/shared/hooks/useBranchStatus.ts`
- `packages/web-core/src/shared/hooks/useTaskWorkspaces.ts`

## Current Status

- Confirmed:
  - the worktree is clean
  - `vk/ea3c-vk-auto-archive` currently matches `staging`
  - the latest landed stability hotfix in this checkout is `88c0ebd59`
  - the live local VK service currently reports `shared_api_base: null`
- Pending:
  - explicit direction for the next branch-local change, if any

## Risks / Regression Traps

- Trusting stale continuity docs instead of the checked-out branch and code
- Assuming this worktree still contains the backup-retention PR scope
- Starting new edits without first recording the real branch intent in `STREAM.md`

## Next Safe Steps

1. Verify the local runtime still reports `shared_api_base: null`.
2. Treat this worktree as a clean staging-equivalent baseline until a new scoped task is defined.
3. If new work starts here, update `STREAM.md` and `HANDOFF.md` before handing off again.
