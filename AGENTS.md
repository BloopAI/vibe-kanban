# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vibe Kanban is a task management tool for orchestrating AI coding agents (Claude Code, Gemini CLI, Codex, Cursor, etc.). It's a full-stack application with a Rust backend and React/TypeScript frontend, distributed via npm as `npx vibe-kanban`.

## Project Structure & Module Organization
- `crates/`: Rust workspace crates — `server` (API + bins), `db` (SQLx models/migrations), `executors`, `services`, `utils`, `deployment`, `local-deployment`, `remote`, `review`.
- `frontend/`: React + TypeScript app (Vite, Tailwind). Source in `frontend/src`.
- `frontend/src/components/dialogs`: Dialog components for the frontend.
- `remote-frontend/`: Remote deployment frontend.
- `shared/`: Generated TypeScript types (`shared/types.ts`). Do not edit directly.
- `assets/`, `dev_assets_seed/`, `dev_assets/`: Packaged and local dev assets.
- `npx-cli/`: Files published to the npm CLI package.
- `scripts/`: Dev helpers (ports, DB preparation).
- `docs/`: Documentation files.

## Managing Shared Types Between Rust and TypeScript

ts-rs derives TypeScript types from Rust structs/enums. Annotate Rust types with `#[derive(TS)]` and related macros.
- Regenerate types: `pnpm run generate-types`
- Do not manually edit `shared/types.ts` — instead edit `crates/server/src/bin/generate_types.rs`

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)
- `cargo-watch` and `sqlx-cli` for development: `cargo install cargo-watch sqlx-cli`

## Build, Test, and Development Commands
- Install: `pnpm i`
- Run dev (frontend + backend with ports auto-assigned): `pnpm run dev`
- Backend (watch): `pnpm run backend:dev:watch`
- Frontend (dev): `pnpm run frontend:dev`
- Type checks: `pnpm run check` (frontend) and `pnpm run backend:check` (Rust cargo check)
- Rust tests: `cargo test --workspace`
- Generate TS types from Rust: `pnpm run generate-types` (or `generate-types:check` in CI)
- Prepare SQLx (offline): `pnpm run prepare-db`
- Prepare SQLx (remote package, postgres): `pnpm run remote:prepare-db`
- Local NPX build: `pnpm run build:npx` then `pnpm pack` in `npx-cli/`

## Coding Style & Naming Conventions
- Rust: `rustfmt` enforced (`rustfmt.toml`); group imports by crate; snake_case modules, PascalCase types.
- TypeScript/React: ESLint + Prettier (2 spaces, single quotes, 80 cols). PascalCase components, camelCase vars/functions, kebab-case file names where practical.
- Keep functions small, add `Debug`/`Serialize`/`Deserialize` where useful.

## Testing Guidelines
- Rust: prefer unit tests alongside code (`#[cfg(test)]`), run `cargo test --workspace`. Add tests for new logic and edge cases.
- Frontend: ensure `pnpm run check` and `pnpm run lint` pass. If adding runtime logic, include lightweight tests (e.g., Vitest) in the same directory.

## Security & Config Tips
- Use `.env` for local overrides; never commit secrets. Key envs: `FRONTEND_PORT`, `BACKEND_PORT`, `HOST`
- Dev ports and assets are managed by `scripts/setup-dev-environment.js`.

## Task Management Workflow (Vibe Kanban MCP)

Use the Vibe Kanban MCP tools to manage tasks for this project:

### Listing Tasks
- Use `mcp__vibe_kanban__list_projects` to get the project ID
- Use `mcp__vibe_kanban__list_tasks` with the project ID to view all tasks
- Use `mcp__vibe_kanban__get_task` to get detailed task information

### Starting a New Task
1. Create a new feature branch before starting work:
   ```bash
   git checkout -b feature/<task-name>
   # or for bug fixes:
   git checkout -b fix/<task-name>
   ```
2. Update task status to `inprogress`: use `mcp__vibe_kanban__update_task` with `status: "inprogress"`

### Completing a Task
1. Ensure all changes are committed to the feature branch
2. Update task status to `done`: use `mcp__vibe_kanban__update_task` with `status: "done"`
3. Create a PR or merge the feature branch as appropriate

### Creating New Tasks
- Use `mcp__vibe_kanban__create_task` with the project ID, title, and optional description

### Task Status Values
- `todo` - Not started
- `inprogress` - Currently being worked on
- `inreview` - Ready for review
- `done` - Completed
- `cancelled` - No longer needed
