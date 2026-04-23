# Release Safety

## Purpose

This document defines the repo-specific safe path from feature work to local validation to upstream PR promotion for this Vibe Kanban fork.

## Branch And Promotion Model

- `staging` is the integration branch for normal work.
- `main` is the production branch.
- Task work happens on short-lived feature or fix branches.
- Local validation happens before a PR into `staging`.
- Production promotion happens by PR from `staging` into `main`.

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

## What Counts As Local Validation

Local validation should exercise the actual user-facing or operator-facing path that changed. Examples:

- UI or workflow changes: run `pnpm run preview:light` against the existing local backend, then exercise the affected flow in the browser.
- Backend changes: run `pnpm run dev` when backend rebuilds or server-side behaviour must be exercised, then validate the affected API or task lifecycle through the local app.
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
