# HANDOFF.md

## What Changed This Session

- Added Ops Playbook continuity docs and repo-specific release-safety guidance.
- Wired a lightweight governance check into CI.

## What Is True Right Now

- The repo still uses `main` as its only documented long-lived branch.
- Local validation before upstream PR is now documented as a required gate.
- Existing test and release workflows remain the source of truth for application validation and releases.

## What The Next Agent Should Do

- Keep `STREAM.md` current if branch scope changes.
- Run `pnpm run ops:check` when touching root ops docs.
- Expand automation only where the repo can actually enforce the rule.

## What The Next Agent Must Not Do

- Do not describe a `staging` branch as active unless it has actually been introduced.
- Do not move branch-local intent into `STATE.md`.
- Do not weaken the local-validation gate in docs without replacing it with a stronger enforced path.

## Verification Required Before Further Changes

- `pnpm run ops:check`
- `pnpm run format`
- Any task-specific validation affected by later edits

## Verification Status From This Session

- `pnpm run ops:check` passed.
- `git diff --check` passed.
- `pnpm run format` failed in this checkout because `prettier` was not available in the workspace environment.

## Session Metadata

- Branch: `vk/660f-vk-ops`
- Worktree: `/home/mcp/code/worktrees/.vibe-kanban-workspaces/660f-vk-ops/_vibe_kanban_repo`
- Focus: Ops Playbook adoption baseline
