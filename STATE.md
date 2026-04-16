# STATE.md

## Current Objective

- Keep this Vibe Kanban fork aligned with the Ops Playbook using a real `staging` integration branch and a `main` production promotion branch.

## Confirmed Current State

- CI validates repo changes and now includes branch-policy and branch-freshness enforcement for the `staging` to `main` model.
- Release automation already exists via `.github/workflows/pre-release.yml` and `.github/workflows/publish.yml`.
- `origin` currently has `main` but does not yet have a `staging` branch.

## In Progress

- Finishing the repo-side implementation of the `staging` to `main` model and handing off the remaining GitHub setup step.

## Proposed / Not Adopted

- Automated stale-branch or stale-worktree cleanup.

## Known Gaps / Blockers / Deferred

- GitHub still needs the real `staging` branch created and protected.
- Human local QA remains part of the promotion gate rather than an automated workflow.

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

- Normal feature work should start from the latest `origin/staging`.
- Local-instance validation is required before PRs into `staging`.
- Production promotion should happen by PR from `staging` into `main`.
- Repo-governance docs are required and checked in CI.

## Risks / Regression Traps

- Until the real `staging` branch is created on GitHub, the documented branch model and remote branch reality are out of sync.
- Continuity docs can become noise if they are not kept current per stream.

## Next Safe Steps

- Use `STREAM.md` and `HANDOFF.md` on active branches.
- Keep `ops:check` passing as root docs evolve.
- Create and protect `staging` on GitHub.
- Keep branch freshness and promotion policy checks passing on PRs.
