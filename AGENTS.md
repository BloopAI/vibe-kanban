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

## Task Management Workflow (Team Issues)

**All work should be tracked as Team Issues under the vibe-kanban team.** Team Issues are tasks that appear on the Team Issues board with auto-assigned issue numbers (VIB-XX).

### Quick Reference - Creating a Task
```bash
./scripts/vk-cli.py create <project> "<title>" --team vibe-kanban -d "<description>"
```
Example: `./scripts/vk-cli.py create frontend "Add search feature" --team vibe-kanban -d "Implement search"`

### Team and Project Mapping
- **Team**: `vibe-kanban` - `ea68ef91-e9b7-4c28-9f53-077cf6a08fd3`
- **Projects** (map issues to the relevant project based on work type):
  - **frontend** - `5b8810bc-b52f-464f-b87c-4a10542c14d3` - React/TypeScript UI work
  - **backend** - `270d5829-6691-44b8-af81-594e70e88f15` - Rust API/server work
  - **vibe-kanban** - `1277542c-2247-4c9d-a236-c38173459694` - General/full-stack work

### Feature Planning Documentation

**Before implementing any new feature or significant fix**, create planning documents in the **Documents > planning** folder:

#### Required Documents:
1. **`<feature-name>-flow.md`** - ASCII flow diagram showing:
   - User interactions
   - System components involved
   - Data flow between frontend → backend → database
   - External service integrations (if any)

2. **`<feature-name>-spec.md`** - Feature specification containing:
   - **Purpose**: One-line description
   - **Scope**: What's included / excluded
   - **Components**: Files and modules affected
   - **API Endpoints**: Routes with request/response
   - **Database Changes**: New tables or migrations
   - **UI Changes**: Pages and components

**Rules:**
- No code snippets in planning docs
- Be precise and specific
- Focus on WHAT, not HOW
- Keep it brief - one page maximum per document

#### Example:
```
Documents/
└── planning/
    ├── github-oauth-flow.md      # ASCII flow diagram
    └── github-oauth-spec.md      # Feature specification
```

### Complete Workflow for Every Task

#### 1. Create Team Issue First (Before Starting Work)
Use the CLI to create a team issue (task mapped to the vibe-kanban team):
```bash
./scripts/vk-cli.py create <project> "<title>" --team vibe-kanban -d "<description>"
# Examples:
./scripts/vk-cli.py create frontend "Add dark mode toggle" --team vibe-kanban -d "Implement dark mode"
./scripts/vk-cli.py create backend "Add rate limiting" --team vibe-kanban -d "Add API rate limiting"
```

**Important**: Always include `--team vibe-kanban` to create a Team Issue that appears on the Issues board.

#### 2. Update Task Status to In Progress
```bash
./scripts/vk-cli.py update <task-id> --status inprogress
```

#### 3. Create Feature Branch
Use the issue number (VIB-XX) from the Team Issues board:
```bash
git checkout main
git pull origin main
git checkout -b feature/<issue-number>-<feature-name-kebab-case>
# Example: git checkout -b feature/VIB-11-multi-workspace-support
```

#### 4. Work on the Task
- Make commits on the feature branch
- Run type checks: `pnpm run frontend:check` and `pnpm run backend:check`
- Test changes locally

#### 5. Push Feature Branch
```bash
git push -u origin feature/<issue-number>-<feature-name-kebab-case>
# Example: git push -u origin feature/VIB-11-multi-workspace-support
```

#### 6. Merge to Main
```bash
git checkout main
git pull origin main
git merge feature/<issue-number>-<feature-name-kebab-case>
git push origin main
```

#### 7. Clean Up Feature Branch
```bash
git branch -d feature/<issue-number>-<feature-name-kebab-case>
git push origin --delete feature/<issue-number>-<feature-name-kebab-case>
```

#### 8. Update Task Status to Done
```bash
./scripts/vk-cli.py update <task-id> --status done
```

### Task Status Values
- `todo` - Not started
- `inprogress` - Currently being worked on
- `inreview` - Ready for review
- `done` - Completed
- `cancelled` - No longer needed

### Useful CLI Commands
```bash
# List all projects
./scripts/vk-cli.py projects

# List all teams
./scripts/vk-cli.py teams

# List team issues (on the Issues board)
./scripts/vk-cli.py issues ea68ef91-e9b7-4c28-9f53-077cf6a08fd3

# List project tasks
./scripts/vk-cli.py tasks frontend

# Get task details
./scripts/vk-cli.py task <task-id>

# Update task
./scripts/vk-cli.py update <task-id> --status done --title "New title"
```
