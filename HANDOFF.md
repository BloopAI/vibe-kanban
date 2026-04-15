# HANDOFF.md

## What Changed This Session

- Added Ops Playbook continuity docs and repo-specific release-safety guidance.
- Wired a lightweight governance check into CI.
- Upgraded the repo docs and CI to a real `staging` to `main` branch model with branch-policy and branch-freshness checks.

## What Is True Right Now

- The repo-side implementation now assumes a real `staging` plus `main` model in docs and CI.
- Existing test and release workflows remain the source of truth for application validation and releases.
- `origin` still does not have a `staging` branch, so the human setup step is still outstanding.

## What The Next Agent Should Do

- Keep `STREAM.md` current if branch scope changes.
- Run `pnpm run ops:check` when touching root ops docs.
- Expand automation where the repo can actually enforce the rule, especially branch policy and freshness.

## What The Next Agent Must Not Do

- Do not describe remote `staging` protection as active unless the branch exists on GitHub.
- Do not move branch-local intent into `STATE.md`.
- Do not weaken the local-validation gate or branch-policy checks in docs without replacing them with a stronger enforced path.

## Verification Required Before Further Changes

- `pnpm run ops:check`
- `pnpm run format`
- Any task-specific validation affected by later edits

## Verification Status From This Session

- `pnpm run ops:check` passed.
- `git diff --check` passed.
- `pnpm run format` failed in this checkout because `prettier` was not available in the workspace environment.
- Targeted branch-policy validation passed.
- Branch-freshness validation against `origin/main` failed because this branch is behind the latest upstream `main`.

## Session Metadata

- Branch: `vk/660f-vk-ops`
- Worktree: `/home/mcp/code/worktrees/.vibe-kanban-workspaces/660f-vk-ops/_vibe_kanban_repo`
- Focus: Ops Playbook adoption baseline
