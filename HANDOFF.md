# HANDOFF.md

## What Changed This Session

- Implemented immediate worktree-folder deletion for workspaces whose tracked PRs are merged into `staging`.
- Implemented automatic workspace archiving and worktree cleanup when a linked local issue is moved into `In Staging`.
- Reused the existing archive-on-merge flow instead of adding a new background job.
- Added a safe retry after archive-script completion so archive scripts can finish before the worktree is removed.
- Refreshed the branch-local continuity docs and `VK_WORKFLOW.md` for the new behavior.

## What Is True Right Now

- `crates/services/src/services/container.rs` now exposes a generic safe-delete helper for archived worktrees and keeps the merged-PR-to-`staging` cleanup check as a narrower wrapper.
- `crates/services/src/services/pr_monitor.rs` calls the merged-PR helper after merge detection archives the workspace.
- `crates/server/src/routes/workspaces/pr.rs` calls the same merged-PR helper when attaching an already-merged PR.
- `crates/server/src/routes/local_compat.rs` now archives linked local workspaces and requests immediate worktree cleanup when an issue transitions into `In Staging`, including bulk issue updates.
- `crates/local-deployment/src/container.rs` retries deletion after archive-script completion, which covers workspaces whose archive script delayed cleanup.
- Pinned workspaces still keep the existing behavior and do not auto-archive on merge.
- The branch is currently mid-rebase onto `fork/staging`, and only the continuity docs conflicted.

## What The Next Agent Should Do

- Finish the rebase with the refreshed continuity docs.
- Merge the rebased branch into the local `staging` checkout.
- Push or open/update the PR only after the merge step the user requested is complete.

## What The Next Agent Must Not Do

- Do not remove the archive-script retry path; that would reintroduce a race where the worktree disappears mid-script.
- Do not broaden the merged-PR cleanup path to non-`staging` PRs unless the user explicitly asks for that policy change.
- Do not change pinned-workspace behavior without confirmation.

## Verification Required Before Further Changes

- `git status --short --branch`
- `git rebase --continue`
- merge verification on the local `staging` checkout

## Verification Status From This Session

- The branch rebased attempt started and only continuity-doc conflicts appeared.
- `cargo fmt --all` had already been run before this rebase attempt.
- Full tests were not rerun in this session.

## Session Metadata

- Branch: `vk/7b9a-vk-worktree-clea`
- Repo: `/home/mcp/code/worktrees/7b9a-vk-worktree-clea/_vibe_kanban_repo`
- Focus: immediate worktree cleanup after PR merge into `staging` and on `In Staging` issue transitions
