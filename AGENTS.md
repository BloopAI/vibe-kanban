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
- `mcp/`: MCP server (`server.py`) and CLI (`cli.py`) for task management.
- `scripts/`: Dev helpers (ports, DB preparation).
- `docs/`: Documentation files.


### Git Commit Guidelines

**DO NOT include** the following in commit messages:
- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- `Co-Authored-By: Claude ...` signatures

**Commit message format:**
```
<type>: <short description> (<task-id>)

<optional longer description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`



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

Use the Vibe Kanban MCP tools to manage tasks for this project.

### Data Model

**Team: vibe-kanban** - All work is tracked under this team
- **Issues/Tasks** - Created and mapped to projects
- **Documents** - Stored in folders as markdown files
- **Projects** - Categorize work by area (frontend, backend, integration)

### Available Projects (under vibe-kanban team)

| Project | ID | Use For |
|---------|-----|---------|
| **frontend** | `5b8810bc-b52f-464f-b87c-4a10542c14d3` | React/TypeScript UI work |
| **backend** | `270d5829-6691-44b8-af81-594e70e88f15` | Rust API/server work |
| **integration** | `45da934b-60f3-4ecd-8795-acbd9b454a22` | Cross-cutting/integration work |

### Document Folders

Store planning documents and specs under **Team > Documents** in the appropriate folder:
- **planning/** - Feature plans, implementation specs
- Use markdown format for all documents

### 🚨 MANDATORY REQUIREMENTS - NO EXCEPTIONS 🚨

> **⚠️ VIOLATIONS WILL RESULT IN TASK REJECTION AND REWORK ⚠️**
>
> These requirements are NON-NEGOTIABLE. Tasks missing these steps are INCOMPLETE.

#### 1. Planning Documents (REQUIRED for EVERY task)

**BEFORE writing ANY code**, create BOTH documents in `planning/` folder:

| Document | Filename | Purpose |
|----------|----------|---------|
| **Flow Diagram** | `VIB-XX-feature-flow.md` | ASCII diagram showing data flow, component relationships |
| **Implementation Plan** | `VIB-XX-feature-plan.md` | Step-by-step plan with affected files, changes needed |

**Penalty for skipping:**
- Task will be marked as INCOMPLETE regardless of code status
- Must create planning documents retroactively before task closure
- Repeated violations will result in workflow audit

**Past violations:** VIB-64, VIB-65, VIB-66 were completed WITHOUT planning documents - this is UNACCEPTABLE.

#### 2. End-to-End Testing (REQUIRED before commit)

**BEFORE committing code**, you MUST:

1. **Restart server**: `make restart && sleep 5 && make status`
2. **Test API with curl**: Verify endpoints return expected responses
   ```bash
   curl -s -X POST 'http://localhost:3003/api/<endpoint>' \
     -H 'Content-Type: application/json' \
     -d '{"field": "value"}' | jq .
   ```
3. **Test UI flow**: Open browser, perform action, verify result
4. **Check for errors**: Browser console (F12), server logs (`make logs`)

**Common issues to catch:**
- `NOT NULL constraint failed` - Missing columns in INSERT statements
- `UNIQUE constraint failed` - Duplicate entries
- `FOREIGN KEY constraint failed` - Invalid references
- HTTP 500 errors - Server-side exceptions

**Penalty for skipping:** Task is INCOMPLETE. VIB-64, VIB-66 bugs were caused by skipping E2E testing.

#### 3. Link Planning Documents to Task (REQUIRED at completion)

Before marking task as `done`, update task description with document links:
```
vk_update_task(task_id="<uuid>", description="## Planning Documents\n- Flow: planning/VIB-XX-flow.md\n- Plan: planning/VIB-XX-plan.md")
```

---

### Complete Workflow for Every Task

#### 1. Create Task First (Before Starting Work)

Use the **MCP tools** or **CLI** to create team issues:

**MCP (preferred in Claude Code):**
```
vk_create_issue(title="Task title", project="frontend", team="vibe-kanban", status="inprogress")
```

**CLI:**
```bash
./mcp/cli.py create <project> "Task title" --team vibe-kanban --status inprogress -d "Description"
```

#### 2. 🚨 Create Planning Documents (MANDATORY - DO NOT SKIP)

**BEFORE writing ANY code**, create both documents:

```bash
# Create in the team's document storage path (planning/ folder)
# Flow diagram: VIB-XX-feature-flow.md
# Implementation plan: VIB-XX-feature-plan.md
```

Then sync to app:
```bash
curl -s -X POST "http://localhost:3003/api/teams/$TEAM_ID/folders/$FOLDER_ID/scan"
```

#### 3. Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/<task-id>-<task-name-kebab-case>
# Example: git checkout -b feature/a76b21a8-add-document-tree-view
```

#### 4. Work on the Task

- Make commits on the feature branch
- Run type checks: `pnpm run frontend:check` and `pnpm run backend:check`

#### 5. 🚨 End-to-End Testing (MANDATORY - DO NOT SKIP)

**BEFORE committing**, test the full flow:

```bash
# 1. Restart server
make restart && sleep 5 && make status

# 2. Test API endpoints with curl
curl -s -X POST 'http://localhost:3003/api/<endpoint>' \
  -H 'Content-Type: application/json' \
  -d '{"field": "value"}' | jq .

# 3. Test UI flow in browser
# 4. Check browser console (F12) and server logs (make logs)
```

**Only proceed if ALL tests pass.**

#### 6. Push Feature Branch

```bash
git push -u origin feature/<task-id>-<task-name-kebab-case>
```

#### 7. Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/<task-id>-<task-name-kebab-case>
git push origin main
```

#### 8. Clean Up Feature Branch

```bash
git branch -d feature/<task-id>-<task-name-kebab-case>
git push origin --delete feature/<task-id>-<task-name-kebab-case>
```

#### 9. 🚨 Link Planning Documents to Task (MANDATORY)

**DO NOT SKIP!** Update task description with document links:

```
vk_update_task(task_id="<uuid>", description="## Planning Documents\n- Flow: planning/VIB-XX-flow.md\n- Plan: planning/VIB-XX-plan.md")
```

#### 10. Update Task Status to Done

```bash
./mcp/cli.py update <task_id> --status done
```

### Task Status Values

- `todo` - Not started
- `inprogress` - Currently being worked on
- `inreview` - Ready for review
- `done` - Completed
- `cancelled` - No longer needed

### MCP Tools (vk)

The `vk` MCP server provides these tools for task management:

| Tool | Description |
|------|-------------|
| `vk_list_teams` | List all teams |
| `vk_list_projects` | List all projects |
| `vk_list_issues` | List issues for a team (kanban board) |
| `vk_list_tasks` | List tasks in a project |
| `vk_get_task` | Get task details by ID |
| `vk_create_issue` | Create a new team issue |
| `vk_update_task` | Update task status/title/description |

**Creating Issues:**
```
vk_create_issue(title="My task", project="frontend", team="vibe-kanban", status="inprogress")
```

### CLI Alternative (mcp/cli.py)

```bash
# List projects
./mcp/cli.py projects

# List team issues
./mcp/cli.py issues vibe-kanban

# Create team issue (ALWAYS use --team flag)
./mcp/cli.py create <project> "title" --team vibe-kanban

# Update task
./mcp/cli.py update <task_id> --status done
```
