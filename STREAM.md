# STREAM.md

## Stream Identifier

- Branch: `vk/660f-vk-ops`
- PR: Not opened yet
- Worktree: `/home/mcp/code/worktrees/.vibe-kanban-workspaces/660f-vk-ops/_vibe_kanban_repo`

## Objective

- Adopt the Ops Playbook baseline into this Vibe Kanban fork with repo-specific rules for local validation before upstream PR promotion.

## In Scope

- Root continuity docs
- Repo-specific ops audit and release-safety documentation
- Lightweight CI enforcement for required ops docs

## Out of Scope

- Adding a dedicated `staging` branch
- Changing application runtime behavior
- Reworking the existing release pipelines beyond documenting their role

## Stream-Specific Decisions

- Adapt the playbook to a `main`-only branch model by using a documented local validation gate in place of `staging`.
- Keep the initial automation lightweight: required-doc presence and references, not broad policy rewrites.

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

## Current Status

- Confirmed:
  - Ops Playbook reviewed.
  - Existing Vibe Kanban CI and release workflows audited.
  - `pnpm run ops:check` passed.
  - `git diff --check` passed.
- Pending:
  - Re-run `pnpm run format` in an environment where frontend formatting dependencies are installed.

## Risks / Regression Traps

- Overstating enforcement would be misleading because branch protection and staging promotion are not implemented here yet.
- Root continuity docs can cause churn if future branches do not keep them targeted and concise.

## Next Safe Steps

1. Validate the new docs and `ops:check`.
2. Run formatting in a fully bootstrapped workspace.
3. Keep future stream updates branch-specific instead of rewriting repo-wide truth.
