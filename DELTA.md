# DELTA.md

## 2026-04-15T21:00:00Z | vk/660f-vk-ops | ops-playbook adoption baseline

- Intent: bring this Vibe Kanban fork up to the Ops Playbook baseline without changing app behavior.
- Completed: added root continuity docs, repo identity doc, repo-specific ops audit, release-safety doc, and a lightweight CI governance check.
- Files changed: `AGENTS.md`, `README.md`, `STATE.md`, `STREAM.md`, `HANDOFF.md`, `DELTA.md`, `REPO_IDENTITY.md`, `docs/audits/vibe-kanban-ops-audit.md`, `docs/operations/release-safety.md`, `scripts/check-ops-playbook.mjs`, `package.json`, `.github/workflows/test.yml`.
- Verified: `pnpm run ops:check` passed and `git diff --check` passed. `pnpm run format` did not complete because `prettier` was not available in this checkout.
- Not complete / known gaps: no dedicated `staging` branch, no enforced branch freshness workflow yet, and local QA remains a documented manual gate.
- Risks / warnings: future branches must keep continuity docs current or the baseline will decay into stale paperwork.
- Next safest step: run `pnpm run ops:check`, format, and confirm the CI workflow syntax remains valid.

## 2026-04-15T22:10:00Z | vk/660f-vk-ops | staging-branch model enforcement

- Intent: replace the temporary `main`-only fallback with the actual ops-playbook `staging` to `main` branch model.
- Completed: updated repo docs toward `staging` as the integration branch, added branch-policy and branch-freshness automation, and updated CI triggers to cover `staging` and `main`.
- Files changed: `AGENTS.md`, `REPO_IDENTITY.md`, `STATE.md`, `STREAM.md`, `HANDOFF.md`, `DELTA.md`, `README.md`, `docs/audits/vibe-kanban-ops-audit.md`, `docs/operations/release-safety.md`, `.github/workflows/test.yml`, `package.json`, `scripts/check-branch-policy.mjs`, `scripts/check-branch-freshness.mjs`.
- Verified: `pnpm run ops:check` passed, `git diff --check` passed, targeted branch-policy validation passed, and branch-freshness validation correctly failed against `origin/main` because this branch is behind upstream.
- Not complete / known gaps: `origin` still needs a real `staging` branch and GitHub protection settings.
- Risks / warnings: branch-policy automation will fail for `staging`-based workflows until the branch exists remotely.
- Next safest step: validate the new scripts locally, then create and protect `staging` on GitHub before relying on the new PR policy.
