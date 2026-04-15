# Release Safety

## Purpose

This document defines the repo-specific safe path from feature work to local validation to upstream PR promotion for this Vibe Kanban fork.

## Branch And Promotion Model

- `main` is the current long-lived branch.
- Task work happens on short-lived feature or fix branches.
- There is no dedicated `staging` branch yet, so local validation is the required integration gate.

## Safe Path For Normal Changes

1. Start from the latest `origin/main`.
2. Make one scoped change on one branch.
3. Run the narrowest relevant validation while developing.
4. Run the branch in the local Vibe Kanban instance and verify the intended behavior before using it as your working local build.
5. Run the upstream PR baseline:
   - `pnpm run format`
   - `pnpm run ops:check`
   - `pnpm run check`
   - `pnpm run lint`
   - `cargo test --workspace`
6. If remote code changed, also run:
   - `pnpm run remote:generate-types:check`
   - `pnpm run remote:prepare-db:check`
7. Rebase or merge the latest `origin/main` before opening or updating the upstream PR.
8. Open a single-purpose PR into `main`.

## What Counts As Local Validation

Local validation should exercise the actual user-facing or operator-facing path that changed. Examples:

- UI or workflow changes: run `pnpm run dev` or `pnpm run dev:qa`, then exercise the affected flow in the browser.
- Backend changes: validate the affected API or task lifecycle through the local app.
- Packaging or install changes: run the relevant local build path such as `pnpm run build:npx`.

If part of the change could not be exercised locally, record that explicitly in the branch summary or handoff.

## What Blocks Upstream Promotion

- Missing required root ops docs
- Failing CI or local validation baseline
- A branch that is behind `origin/main`
- A PR that mixes unrelated concerns

## Release Notes On Current State

- This repo already has pre-release and publish workflows.
- Those workflows are release mechanisms, not substitutes for branch-level local validation.
- If a `staging` branch is introduced later, this document should be updated so the integration gate moves from local-only validation to `staging` promotion.
