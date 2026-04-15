# STREAM.md

## Stream Identifier

- Branch: `vk/660f-vk-ops`
- PR: Not opened yet
- Worktree: `/home/mcp/code/worktrees/.vibe-kanban-workspaces/660f-vk-ops/_vibe_kanban_repo`

## Objective

- Move this Vibe Kanban fork from a lightweight ops-playbook baseline to an enforced `staging` plus `main` branch model.

## In Scope

- Updating root continuity docs to the real branch model
- Repo-specific release-safety updates for `staging` promotion
- CI enforcement for branch policy and branch freshness

## Out of Scope

- Changing application runtime behavior
- Reworking release packaging and publishing mechanics

## Stream-Specific Decisions

- Adopt the actual playbook branch model in repo docs and CI now.
- Treat remote `staging` branch creation and GitHub protection settings as the remaining human setup step.

## Relevant Files / Modules

- `AGENTS.md`
- `README.md`
- `STATE.md`
- `STREAM.md`
- `HANDOFF.md`
- `DELTA.md`
- `REPO_IDENTITY.md`
- `docs/audits/vibe-kanban-ops-audit.md`
- `docs/operations/release-safety.md`
- `.github/workflows/test.yml`
- `package.json`
- `scripts/check-ops-playbook.mjs`
- `scripts/check-branch-policy.mjs`
- `scripts/check-branch-freshness.mjs`

## Current Status

- Confirmed:
  - Ops Playbook reviewed.
  - Existing Vibe Kanban CI and release workflows audited.
  - `pnpm run ops:check` passed.
  - `git diff --check` passed.
  - Branch-policy script passed targeted validation for `staging` and `main` PR paths.
- Pending:
  - Branch-model docs and CI from `main`-only to `staging` plus `main`.
  - Re-run `pnpm run format` in an environment where frontend formatting dependencies are installed.
  - Create the real `staging` branch on GitHub and validate freshness against it.

## Risks / Regression Traps

- Overstating enforcement would be misleading because branch protection and staging promotion are not implemented here yet.
- GitHub does not yet have a real `staging` branch.
- The new freshness check currently fails against `origin/main` because this branch is behind the latest upstream tip.
- Root continuity docs can cause churn if future branches do not keep them targeted and concise.

## Next Safe Steps

1. Run targeted validation plus `ops:check`.
2. Create and protect `staging` on GitHub, then validate freshness against it.
3. Run formatting in a fully bootstrapped workspace.
