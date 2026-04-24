# HANDOFF.md

## What Changed This Session

- Reframed the archive-project follow-up onto a fresh branch from `fork/staging`.
- Replaced the old inline archived-project navigation plan with a modal-based restore flow.
- Updated the desktop and mobile project navigation paths so archived projects are meant to be reopened from a dedicated archive action instead of remaining visible in the nav.

## What Is True Right Now

- This worktree is on `vk/6d92-vk-archive-modal`, tracking `fork/staging`.
- The corrected UX work is local in this worktree and not yet pushed.
- The main code touchpoints are:
  - `packages/ui/src/components/AppBar.tsx`
  - `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
  - `packages/web-core/src/shared/dialogs/kanban/ArchivedProjectsDialog.tsx`

## What The Next Agent Should Do

- Run the relevant validation that this environment supports.
- Commit and push the archive modal follow-up branch.
- Open the new PR into `staging`.

## What The Next Agent Must Not Do

- Do not reintroduce archived projects as a visible list in the left-column nav.
- Do not expand this follow-up into remote/cloud project behavior.
- Do not edit generated files for this UX-only correction.

## Verification Required Before Further Changes

- `git status --short --branch`
- `pnpm run format`
- the narrowest relevant frontend check available in this worktree
- human smoke test of archive modal open and restore behavior when possible

## Verification Status From This Session

- `cargo fmt --all` completed as part of `pnpm run format`.
- `pnpm run format` stopped in `packages/web-core` because `prettier` is not installed in this worktree.
- `pnpm --filter @vibe/web-core run check` failed immediately because `tsc` is not installed in this worktree.

## Session Metadata

- Branch: `vk/6d92-vk-archive-modal`
- Repo: `/home/mcp/code/worktrees/cc95-vk-archive-proje/_vibe_kanban_repo`
- Focus: archive-project modal restore UX
