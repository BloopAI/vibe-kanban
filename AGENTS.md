# Repository Guidelines

## Purpose

- This repo uses the Ops Playbook continuity model adapted for Vibe Kanban.
- The goal is to keep feature work isolated, tested locally in this fork before use in a local Vibe Kanban instance, and only then promoted into an upstream PR.
- Keep this file stable. Current branch intent belongs in `STREAM.md`, not here.

## Required Read Order

1. `AGENTS.md`
2. `STATE.md`
3. `STREAM.md`
4. `HANDOFF.md`
5. Relevant package or crate guide for the area being changed
6. Code and validation paths for the task
7. `DELTA.md` only for compact continuity history

### Crate-specific guides

- [`crates/remote/AGENTS.md`](crates/remote/AGENTS.md) — Remote server architecture, ElectricSQL integration, mutation patterns, environment variables.
- [`docs/AGENTS.md`](docs/AGENTS.md) — Mintlify documentation writing guidelines and component reference.
- [`packages/local-web/AGENTS.md`](packages/local-web/AGENTS.md) — Web app design system styling guidelines.

## Authority Order

1. Code, workflows, and validated behavior
2. `STATE.md`
3. `STREAM.md`
4. `HANDOFF.md`
5. `DELTA.md`

## Project Structure & Module Organization

- `crates/`: Rust workspace crates — `server` (API + bins), `db` (SQLx models/migrations), `executors`, `services`, `utils`, `git` (Git operations), `api-types` (shared API types for local + remote), `review` (PR review tool), `deployment`, `local-deployment`, `remote`.
- `packages/local-web/`: Local React + TypeScript app entrypoint (Vite, Tailwind). Shell source in `packages/local-web/src`.
- `packages/remote-web/`: Remote deployment frontend entrypoint.
- `packages/web-core/`: Shared React + TypeScript frontend library used by local + remote web (`packages/web-core/src`).
- `shared/`: Generated TypeScript types (`shared/types.ts`, `shared/remote-types.ts`) and agent tool schemas (`shared/schemas/`). Do not edit generated files directly.
- `assets/`, `dev_assets_seed/`, `dev_assets/`: Packaged and local dev assets.
- `npx-cli/`: Files published to the npm CLI package.
- `scripts/`: Dev helpers, validation helpers, and DB preparation.
- `docs/`: Documentation files, including ops audit and release-safety guidance.

## Branch / PR Rules

- Treat `main` as the protected production and upstream PR target branch.
- Treat `staging` as the protected integration branch for normal work.
- Start normal work from the latest `origin/staging`.
- Use one branch per stream and one PR per concern.
- Open normal feature, fix, docs, and chore PRs into `staging`.
- Only open PRs into `main` from `staging`, except for explicit `hotfix/*` branches.
- Validate a feature in this fork's local Vibe Kanban instance before promoting it to `staging`, and treat the `staging` to `main` PR as the production promotion step.
- Do not mix unrelated cleanup, refactors, and feature work in the same branch.
- Keep a canonical local checkout of `main` current with `origin/main`; do not leave the operator's reference checkout stale after merges.
- Keep a canonical local checkout of `staging` current with `origin/staging` once the branch is created.
- If a direct production hotfix is ever needed, branch from the latest `origin/main`, keep scope minimal, and backfill the fix to `staging` afterward.

## Documentation Roles

- `README.md`: repo overview, setup, and links to operational docs.
- `REPO_IDENTITY.md`: stable explanation of this fork's role and release path.
- `AGENTS.md`: stable operating rules.
- `STATE.md`: repo-wide truth.
- `STREAM.md`: current branch scope and boundaries.
- `HANDOFF.md`: short pickup note for the next agent.
- `DELTA.md`: append-only continuity ledger.

## Managing Shared Types Between Rust and TypeScript

`ts-rs` allows you to derive TypeScript types from Rust structs and enums. When making changes to the types, regenerate them with `pnpm run generate-types`. Do not edit `shared/types.ts` directly; edit `crates/server/src/bin/generate_types.rs` instead.

For remote and cloud types, regenerate with `pnpm run remote:generate-types`. Do not edit `shared/remote-types.ts` directly; edit `crates/remote/src/bin/remote-generate-types.rs` instead.

## Build, Test, and Development Commands

- Install: `pnpm i`
- Run dev (web app + backend with ports auto-assigned): `pnpm run dev`
- Run QA dev mode: `pnpm run dev:qa`
- Lightweight frontend preview against an existing local backend: `pnpm run preview:light`; stop with `pnpm run preview:light:stop`
- Backend (watch): `pnpm run backend:dev:watch`
- Web app (dev): `pnpm run local-web:dev`
- Type checks: `pnpm run check`
- Lint: `pnpm run lint`
- Rust tests: `cargo test --workspace`
- Generate TS types from Rust: `pnpm run generate-types`
- Prepare SQLx (offline): `pnpm run prepare-db`
- Prepare SQLx (remote package, postgres): `pnpm run remote:prepare-db`
- Local NPX build: `pnpm run build:npx` then `pnpm pack` in `npx-cli/`
- Ops governance check: `pnpm run ops:check`
- Format code: `pnpm run format`

## Validation Rules

- Before finishing any task, run `pnpm run format`.
- Before using a branch in a local Vibe Kanban instance, run the narrowest relevant checks and document what was not exercised.
- For routine UI smoke tests, prefer the lightweight preview workflow in `docs/self-hosting/lightweight-agent-preview.mdx` over starting another backend watcher; use full dev mode only when backend behaviour must be exercised.
- Before opening or updating a PR into `staging`, the default validation baseline is `pnpm run ops:check`, `pnpm run check`, `pnpm run lint`, and `cargo test --workspace`, plus any repo-specific generation checks affected by the change.
- Before promoting `staging` into `main`, require a fresh `staging` branch, passing CI, and explicit human QA for meaningful user-facing changes.
- If work touches remote deployment paths, include `pnpm run remote:generate-types:check` and `pnpm run remote:prepare-db:check`.
- Do not claim completion without stating what was actually validated.

## Coding Style & Naming Conventions

- Rust: `rustfmt` enforced (`rustfmt.toml`); group imports by crate; snake_case modules, PascalCase types.
- TypeScript and React: ESLint + Prettier (2 spaces, single quotes, 80 cols). PascalCase components, camelCase vars/functions, kebab-case file names where practical.
- Keep functions small, add `Debug` / `Serialize` / `Deserialize` where useful, and add tests for new behavior or edge cases.

## Agent Summary Standard

- Use this format only for the final user-facing completion message of a turn or task. Do not use it for intermediate progress updates.
- Use this default section order:
  - `Validation`
  - `What changed`
  - `Why it matters`
  - `What's next`
  - `PR`
  - `Docs`
  - `Churn`
  - `Human Needed`
  - `Commit/Push`
  - `Preview URL`
  - `Branch`
  - `Worktree`
- Keep `Validation`, `What changed`, `Why it matters`, and `What's next` as short complete-sentence narrative.
- Keep the metadata block compact:
  - add exactly one blank line after `What's next`
  - use one line each for `PR`, `Docs`, `Churn`, `Human Needed`, `Commit/Push`, `Preview URL`, `Branch`, and `Worktree`
  - use `::` separators
  - do not add blank lines inside the metadata block
- Use:
  - `Docs:: Current` or `Docs:: Not Current`
  - `Churn:: Yes` or `Churn:: No`
  - `Human Needed:: Yes` or `Human Needed:: No`
- Use `Commit/Push::` on one line and include both states, for example `Commit/Push:: Committed and Pushed`.
- If a PR does not exist yet, use `PR:: Not opened yet`.
- When `PR::` or `Preview URL::` include a URL, format it as a clickable Markdown link.
- Use one of:
  - `Preview URL:: Not Generated`
  - `Preview URL:: Updated [Open preview](https://...)`
  - `Preview URL:: NotUpdated [Open preview](https://...)`

## Security & Config Tips

- Use `.env` for local overrides; never commit secrets.
- Key envs: `FRONTEND_PORT`, `BACKEND_PORT`, `HOST`, `VK_ALLOWED_ORIGINS`.
- Dev ports and assets are managed by `scripts/setup-dev-environment.js`.

## Forbidden Behaviors

- Do not treat branch-local notes as repo-wide truth.
- Do not release unvalidated changes into the local instance just because CI would probably pass.
- Do not leave continuity state only in chat.
- Do not edit generated shared type files manually.
