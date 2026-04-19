# HANDOFF.md

## What Changed This Session

- Added a persistent `archived` flag to local projects and a DB migration for it.
- Exposed local project archive updates through `/api/projects/{project_id}`.
- Added archive control to the local project settings dialog.
- Updated the left-column AppBar and mobile drawer so archived local projects leave the main list and can be restored from an Archived section.
- Regenerated `shared/types.ts` for the local project model change.

## What Is True Right Now

- The live local install is the source of truth.
- `/api/info` reports `shared_api_base: null`.
- The board/issue data now lives locally in `~/.local/share/vibe-kanban/db.v2.sqlite`.
- `staging` is the base branch for this work.
- The feature branch for this work is `vk/cc95-vk-archive-proje`.
- The local project list now has archive/restore behavior for local projects only.

## Known Good Validation

- `pnpm run generate-types`
- `cargo fmt --all`
- Not completed in this worktree environment:
  - `pnpm run format` failed because `prettier` was not installed
  - `pnpm --filter @vibe/web-core run check` failed because `tsc` was not installed
  - full `cargo check --workspace` was started but not waited through to completion

## What The Next Agent Should Do

- Push `vk/cc95-vk-archive-proje` to `fork`, open/update the PR into `staging`, and land it when the branch is rebased cleanly.
- Install JS dependencies in the worktree if frontend formatting/typecheck is required before merge.
- Verify the archive flow in the live local UI by archiving one local project and restoring it from Archived.

## What The Next Agent Must Not Do

- Do not re-enable `VK_SHARED_API_BASE` or `VK_SHARED_RELAY_API_BASE` for the local install.
- Do not treat archived projects as deleted projects.
- Do not remove the restore affordance when hiding archived projects from the main list.
- Do not expand this branch into remote/cloud project archiving unless the scope is explicitly reopened.

## Verification Required Before Further Changes

- `curl -s http://127.0.0.1:4311/api/info` and confirm `shared_api_base` is `null`
- `git status --short --branch`
- Task-specific validation for project-list archive/restore behavior

## Verification Status From This Session

- `pnpm run generate-types` passed
- `cargo fmt --all` passed
- `pnpm run format` could not complete because `prettier` was missing
- `pnpm --filter @vibe/web-core run check` could not complete because `tsc` was missing

## Session Metadata

- Branch: `vk/cc95-vk-archive-proje`
- Repo: `/home/mcp/code/worktrees/cc95-vk-archive-proje/_vibe_kanban_repo`
- Focus: local project archive/restore flow for the left-column project list
