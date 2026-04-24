# STREAM.md

## Stream Identifier

- Branch: `vk/7b9a-vk-worktree-clea`
- Repo: `/home/mcp/code/worktrees/7b9a-vk-worktree-clea/_vibe_kanban_repo`
- Base: `fork/staging`
- Working mode: workspace lifecycle cleanup

## Objective

- Delete workspace worktree folders as soon as a tracked PR into `staging` is merged, and archive linked workspaces plus clean up their worktrees automatically when an issue is moved into `In Staging`.

## In Scope

- PR-merge monitoring paths that already archive workspaces
- Safe immediate worktree deletion for merged-to-`staging` workspaces
- Local issue status transitions into `In Staging`
- Workflow documentation for the new behaviour
- Branch-local continuity docs for this stream

## Out of Scope

- Changing merge behavior for direct local merges
- Altering the general archived-workspace retention policy for other cases
- Changing pin semantics for merged workspaces

## Stream-Specific Decisions

- Reuse the existing archive-on-merge flow instead of adding a separate post-merge job.
- Only trigger immediate folder deletion for PRs merged into `staging`.
- If an archive script is still running, defer deletion until that archive script exits.
- Treat moving a local issue into `In Staging` as an explicit archive-and-cleanup signal for linked local workspaces.
- Preserve the current pinned-workspace exception from auto-archiving.

## Relevant Files / Modules

- `crates/services/src/services/container.rs`
- `crates/services/src/services/pr_monitor.rs`
- `crates/local-deployment/src/container.rs`
- `crates/server/src/routes/local_compat.rs`
- `crates/server/src/routes/workspaces/pr.rs`
- `VK_WORKFLOW.md`
- `HANDOFF.md`
- `DELTA.md`

## Current Status

- Completed:
  - added a shared container helper for safe immediate deletion of archived worktrees
  - kept the merged-PR-to-`staging` cleanup path on top of that helper
  - wired the PR monitor and attach-existing-PR route to clean up worktrees after archive-on-merge succeeds
  - added a retry after archive-script completion so deletion waits for archive scripts to finish
  - archived linked local workspaces and cleaned up their worktrees when a local issue transitions into `In Staging`, including bulk issue updates
  - documented the new post-merge cleanup behaviour in `VK_WORKFLOW.md`
- In progress:
  - rebasing the branch onto current `fork/staging`
- Pending:
  - finish the rebase
  - merge this branch into `staging`

## Risks / Regression Traps

- Deleting the worktree before an archive script finishes would break archive-script execution; the retry path must remain in place.
- The merged-PR cleanup path relies on tracked PR metadata; workspaces without tracked PR rows still fall back to the existing time-based cleanup path unless `In Staging` is used.
- Pinned workspaces still skip archive-on-merge, so they do not use the merged-PR immediate deletion path.

## Next Safe Steps

1. Resolve the current continuity-doc rebase conflict by keeping this branch’s stream notes.
2. Continue the rebase onto `fork/staging`.
3. Merge the rebased branch into the local `staging` checkout.
