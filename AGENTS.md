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

Use the Vibe Kanban MCP tools to manage tasks for this project. **All work should be tracked under the vibe-kanban team.**

### Available Projects for Task Mapping
- **frontend** - `5b8810bc-b52f-464f-b87c-4a10542c14d3` - React/TypeScript UI work
- **backend** - `270d5829-6691-44b8-af81-594e70e88f15` - Rust API/server work
- **vibe-kanban** - `1277542c-2247-4c9d-a236-c38173459694` - General/full-stack work

### Complete Workflow for Every Task

#### 1. Create Task First (Before Starting Work)
Use `mcp__vibe_kanban__create_task` with:
- `project_id`: Map to relevant project (frontend, backend, or vibe-kanban)
- `title`: Clear, descriptive task title
- `description`: Detailed description of what needs to be done

#### 2. Update Task Status to In Progress
Use `mcp__vibe_kanban__update_task` with:
- `task_id`: The created task ID
- `status`: `"inprogress"`

#### 3. Create Feature Branch
```bash
git checkout main
git pull origin main
git checkout -b feature/<task-id>
# Example: git checkout -b feature/a76b21a8
```

#### 4. Work on the Task
- Make commits on the feature branch
- Run type checks: `pnpm run frontend:check` and `pnpm run backend:check`
- Test changes locally

#### 5. Push Feature Branch
```bash
git push -u origin feature/<task-id>
```

#### 6. Merge to Main
```bash
git checkout main
git pull origin main
git merge feature/<task-id>
git push origin main
```

#### 7. Clean Up Feature Branch
```bash
git branch -d feature/<task-id>
git push origin --delete feature/<task-id>
```

#### 8. Update Task Status to Done
Use `mcp__vibe_kanban__update_task` with:
- `task_id`: The task ID
- `status`: `"done"`

### Task Status Values
- `todo` - Not started
- `inprogress` - Currently being worked on
- `inreview` - Ready for review
- `done` - Completed
- `cancelled` - No longer needed

### Listing Tasks
- Use `mcp__vibe_kanban__list_projects` to get project IDs
- Use `mcp__vibe_kanban__list_tasks` with project ID to view all tasks
- Use `mcp__vibe_kanban__get_task` to get detailed task information
