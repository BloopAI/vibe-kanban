# STREAM.md

## Stream Identifier

- Branch: `vk/53b2-vk-needs-review`
- Repo: `/home/mcp/code/worktrees/53b2-vk-needs-review/_vibe_kanban_repo`
- Base: `fork/staging`
- Working mode: local VK UI polish

## Objective

- Add a project-level visual indicator in the left app bar when a project has linked workspaces that need review.

## In Scope

- App bar project icon badge rendering
- Project-level aggregation of workspace review-needed state
- Branch-local continuity docs for this stream

## Out of Scope

- Changing workspace-level review semantics
- Remote deployment behavior changes
- Broader kanban sidebar redesign

## Stream-Specific Decisions

- Reuse existing workspace attention signals instead of inventing a new project review state.
- Treat a workspace as needing review when it has pending approval or unseen completed activity.
- Keep the change scoped to the app bar and lightweight supporting API helpers.

## Relevant Files / Modules

- `packages/ui/src/components/AppBar.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
- `packages/web-core/src/shared/lib/api.ts`
- `HANDOFF.md`
- `DELTA.md`

## Current Status

- Completed:
  - rebased the feature branch onto current `fork/staging`
  - preserved the project-level `Needs Review` bubbles on top of the newer app bar/archive/order code
- Pending:
  - force-push the rebased branch
  - merge PR `#5`

## Risks / Regression Traps

- Local and signed-in project lists use different workspace-to-project mapping paths; both must resolve the same attention semantics.
- Missing local frontend dependencies may still block full formatter/typecheck runs in this worktree.

## Next Safe Steps

1. Finish the rebase by recording refreshed continuity docs.
2. Force-push `vk/53b2-vk-needs-review`.
3. Merge PR `#5` into `staging`.
