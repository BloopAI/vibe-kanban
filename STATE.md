# STATE.md

## Current Objective

- Keep this Vibe Kanban fork aligned with the Ops Playbook so features are validated locally before they are proposed upstream.

## Confirmed Current State

- `main` is the only canonical long-lived branch currently documented in this repo.
- CI already validates PRs to `main` with frontend, backend, schema, remote, and Tauri checks.
- Release automation already exists via `.github/workflows/pre-release.yml` and `.github/workflows/publish.yml`.
- This adoption pass adds continuity docs and a repo-governance check, but does not change application behavior.

## In Progress

- Bringing the repo up to the Ops Playbook baseline without interrupting current feature delivery.

## Proposed / Not Adopted

- A dedicated `staging` branch for integration and release promotion.
- Automated stale-branch or stale-worktree cleanup.

## Known Gaps / Blockers / Deferred

- There is not yet an enforced staging branch or promotion PR path.
- Human local QA remains a documented process, not an automated workflow.

## Relevant Files / Modules

- `AGENTS.md`
- `REPO_IDENTITY.md`
- `STATE.md`
- `STREAM.md`
- `HANDOFF.md`
- `DELTA.md`
- `docs/audits/vibe-kanban-ops-audit.md`
- `docs/operations/release-safety.md`
- `.github/workflows/test.yml`
- `scripts/check-ops-playbook.mjs`

## Decisions Currently In Force

- Normal feature work starts from the latest `origin/main`.
- Local-instance validation is required before upstream PR promotion.
- Repo-governance docs are required and checked in CI.

## Risks / Regression Traps

- Without a `staging` branch, operators can confuse "passes CI" with "safe to use locally".
- Continuity docs can become noise if they are not kept current per stream.

## Next Safe Steps

- Use `STREAM.md` and `HANDOFF.md` on active branches.
- Keep `ops:check` passing as root docs evolve.
- Introduce branch freshness or staging promotion automation when the repo is ready for stricter gates.
