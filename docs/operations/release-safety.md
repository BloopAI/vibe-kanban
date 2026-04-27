# Release Safety

## Purpose

This document defines the repo-specific safe path from feature work to local validation to upstream PR promotion for this Vibe Kanban fork.

## Branch And Promotion Model

- `staging` is the integration branch for normal work.
- `main` is the production branch.
- Task work happens on short-lived feature or fix branches.
- Local validation happens before a PR into `staging`.
- Production promotion happens by PR from `staging` into `main`.
- Direct production fixes are allowed only on explicit `hotfix/*` branches rooted at the latest `origin/main`.

## Safe Path For Normal Changes

1. Start from the latest `origin/staging`.
2. Make one scoped change on one branch.
3. Run the narrowest relevant validation while developing.
4. Run the branch in the local Vibe Kanban instance and verify the intended behavior before using it as your working local build.
5. Run the PR baseline:
   - `pnpm run format`
   - `pnpm run ops:check`
   - `pnpm run check`
   - `pnpm run lint`
   - `cargo test --workspace`
6. If remote code changed, also run:
   - `pnpm run remote:generate-types:check`
   - `pnpm run remote:prepare-db:check`
7. Rebase or merge the latest `origin/staging` before opening or updating the PR.
8. Open a single-purpose PR into `staging`.
9. After `staging` accumulates validated work, open a promotion PR from `staging` into `main`.

## Safe Path For Production Hotfixes

Use this path only when you must repair the live VK service before the normal
promotion flow can land the fix.

1. Start from the latest `origin/main`.
2. Create a single-purpose `hotfix/*` branch.
3. Reproduce the production issue in a clean local or detached worktree.
4. Run the narrowest relevant validation for the fix.
5. Build and deploy from a clean worktree, not from a dirty canonical checkout.
6. Verify the live service after deploy:
   - `systemctl --user is-active vibe-kanban.service`
   - `tr '\0' '\n' < /proc/$(systemctl --user show -p MainPID --value vibe-kanban.service)/environ | rg '^CODEX_HOME='`
   - `curl -s http://127.0.0.1:4311/api/info`
   - `curl -I http://127.0.0.1:4311/`
   - current frontend asset URL returns `200`
7. Merge the hotfix into `main`.
8. Backfill the same fix into `staging` immediately and verify that branch is not left behind production.

## What Must Not Happen During Hotfixes

- Do not deploy directly from `staging`, a feature branch, or a rescue branch when the intent is a production hotfix.
- Do not rebuild or restart the live service from a dirty canonical repo.
- Do not leave a production-only fix unmerged from both `main` and `staging`.
- Do not restart `vibe-kanban.service` while active VK agents are running unless you explicitly accept killing those runs.
- Do not let service rewrites drop the isolated Codex home. If agent sessions start repeating or resuming confusing context after a service change, follow `docs/self-hosting/codex-home-isolation.mdx`.

## What Counts As Local Validation

Local validation should exercise the actual user-facing or operator-facing path that changed. Examples:

- UI or workflow changes: prefer `pnpm run preview:light` for frontend smoke tests against the existing local backend, then exercise the affected flow in the browser.
- Backend changes: use `pnpm run dev:qa` only when the behaviour cannot be validated through the existing local backend.
- Backend changes: validate the affected API or task lifecycle through the local app.
- Packaging or install changes: run the relevant local build path such as `pnpm run build:npx`.

If part of the change could not be exercised locally, record that explicitly in the branch summary or handoff.

## What Blocks Upstream Promotion

- Missing required root ops docs
- Failing CI or local validation baseline
- A branch that is behind its base branch
- A PR that mixes unrelated concerns
- A PR into `main` whose head branch is not `staging` or an explicit `hotfix/*` branch

## Release Notes On Current State

- This repo already has pre-release and publish workflows.
- Those workflows are release mechanisms, not substitutes for branch-level local validation.
- GitHub still needs the actual `staging` branch created and protected to make this branch model fully active.
