# HANDOFF.md

## What Changed This Session

- Rebasing `vk/19e5-vk-fix-drag-and` onto the latest `fork/staging` required conflict resolution in:
  - `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
  - `packages/web-core/src/shared/hooks/useUiPreferencesScratch.ts`
- The rebased result keeps both:
  - the local-only app bar drag-order persistence fix for project icons
  - newer `staging` behavior around archived local projects and left-column link preferences
- Continuity docs were refreshed earlier on this branch to record the drag-order persistence fix.

## What Is True Right Now

- This worktree is for branch `vk/19e5-vk-fix-drag-and`.
- The feature commit has been rebased onto current `fork/staging`.
- The local-only drag/drop persistence path still relies on `local_project_order` in UI preferences scratch data.
- The branch also carries the earlier docs commit describing the fix and its validation gaps.

## Known Good Access Points

- Local VK server:
  - `http://127.0.0.1:4311`
- Branch repo:
  - `/home/mcp/code/worktrees/19e5-vk-fix-drag-and/_vibe_kanban_repo`

## What The Next Agent Should Do

- Finish the local merge into `staging` after the rebase completes cleanly.
- If validation is needed before pushing, rerun the narrowest relevant checks for the drag/drop change.
- Preserve both local project archive behavior and `local_project_order` persistence if the left app bar changes again.

## What The Next Agent Must Not Do

- Do not drop the `local_project_order` scratch field during future type/scratch refactors.
- Do not treat this branch handoff as repo-wide truth outside `vk/19e5-vk-fix-drag-and`.

## Verification Required Before Further Changes

- `git status --short --branch`
- Confirm rebase completion and target merge result
- Task-specific validation for local app bar project ordering if behavior is touched again

## Verification Status From This Session

- Rebase conflict resolution was completed for the app bar and UI preferences scratch files.
- Full repo validation has not been rerun in this rebase step.
- Known earlier gap remains:
  - `pnpm run format` previously failed because `prettier` was unavailable in the worktree

## Session Metadata

- Branch: `vk/19e5-vk-fix-drag-and`
- Repo: `/home/mcp/code/worktrees/19e5-vk-fix-drag-and/_vibe_kanban_repo`
- Focus: rebasing and landing the local-only left app bar drag-order persistence fix
