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



## SQLx Migrations - CRITICAL RULES

> **See `.claude/lessons-learned.md` for the full incident report from VIB-70**

### Database Locations (IMPORTANT!)

| Build Mode | Database Location |
|------------|-------------------|
| **Debug** (`cargo build`, `make start`) | `dev_assets/db.sqlite` |
| **Release** | `~/Library/Application Support/ai.bloop.vibe-kanban/db.sqlite` |

**In development, you are ALWAYS using `dev_assets/db.sqlite`!**

### Migration Rules - NO EXCEPTIONS

1. **NEVER modify an existing migration file** - SQLx embeds checksums at compile time
2. **NEVER rename a migration file** - Creates VersionMissing errors
3. **NEVER delete a migration file** that has been applied to any database
4. **ALWAYS create a NEW migration file** to alter existing tables

### DATABASE PROTECTION - STRICT POLICY

> **VIOLATION OF THESE RULES WILL RESULT IN IMMEDIATE SESSION TERMINATION**

**ABSOLUTELY FORBIDDEN actions without EXPLICIT user approval:**

| Forbidden Action | Why |
|------------------|-----|
| `rm db.sqlite` or `rm dev_assets/db.sqlite` | Destroys all application data |
| `DROP TABLE` on any table | Causes data loss and application failure |
| `DELETE FROM _sqlx_migrations` | Corrupts migration state |
| `DELETE FROM <any_table>` without WHERE clause | Mass data deletion |
| Any `sqlite3` command that modifies data | Potential data corruption |

**Penalties for violations:**
- First offense: Session terminated, must wait for user to restart
- Repeated offense: User will add you to blocklist and refuse to work with you
- Data loss: Unrecoverable - user loses hours/days of work

**If you encounter database errors:**
1. **STOP** - Do not attempt to "fix" by deleting anything
2. **REPORT** - Tell the user exactly what error you see
3. **ASK** - Request permission before ANY database modification
4. **WAIT** - Let the user decide how to proceed

**The ONLY exception:** User explicitly says "delete the database" or "drop the table"

```bash
# WRONG - modifying existing file
# Edit: crates/db/migrations/20260104300000_create_foo.sql

# CORRECT - create new migration
# Create: crates/db/migrations/20260105000000_alter_foo.sql
```

### Before Switching Git Branches

The database persists across branch switches. If Branch A has migrations that Branch B doesn't:

```bash
# Check current migrations in database
sqlite3 dev_assets/db.sqlite "SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 5;"

# Compare with migration files
ls crates/db/migrations/ | tail -5
```

### Fixing Migration Errors

```bash
# VersionMismatch or VersionMissing error for migration XXXXXX:
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"
sqlite3 dev_assets/db.sqlite "DROP TABLE IF EXISTS <table_name>;"

# Then rebuild
cargo clean -p db -p server && pnpm run prepare-db && cargo build --bin server
make restart
```

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
- **Team ID**: `c1a926de-0683-407d-81de-124e0d161ec5`
- **Issues/Tasks** - Created and mapped to projects
- **Documents** - Stored in folders as markdown files
- **Projects** - Categorize work by area (frontend, backend, integration)

### Available Projects (under vibe-kanban team)

| Project | ID | Use For |
|---------|-----|---------|
| **frontend** | `ba7fe592-42d0-43f5-add8-f653054c2944` | React/TypeScript UI work |
| **backend** | `de246043-3b27-45e4-bd7a-f0d685b317d0` | Rust API/server work |
| **integration** | `bde6ec12-2cf1-4784-9a0e-d03308ade450` | Cross-cutting/integration work |
| **database** | `731d6e37-9223-4595-93a0-412a38af4540` | SQLx migrations, models |
| **ai** | `ffa3f7db-bf84-4e88-b04d-59f5f98a0522` | AI/ML related work |

### Document Folders

**External Documentation Path**: `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/`

Planning documents are stored OUTSIDE the project repository:

| Task Type | Path |
|-----------|------|
| **frontend** | `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/frontend/` |
| **backend** | `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/backend/` |
| **integration** | `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/integration/` |

Use markdown format for all documents.

### 🚨 MANDATORY REQUIREMENTS - NO EXCEPTIONS 🚨

> **⚠️ VIOLATIONS WILL RESULT IN TASK REJECTION AND REWORK ⚠️**
>
> These requirements are NON-NEGOTIABLE. Tasks missing these steps are INCOMPLETE.

#### 1. Planning Documents (REQUIRED for EVERY task)

**BEFORE writing ANY code**, create BOTH documents in the external docs folder:

**Base Path**: `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/{task_type}/`

| Document | Filename | Purpose |
|----------|----------|---------|
| **Flow Diagram** | `VIB-XX-feature-flow.md` | ASCII diagram showing data flow, component relationships |
| **Implementation Plan** | `VIB-XX-feature-plan.md` | Step-by-step plan with affected files, changes needed |

**Example for backend task**:
- `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/backend/VIB-71-backup-flow.md`
- `/Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/backend/VIB-71-backup-plan.md`

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

Use the **API directly** to create team issues (MCP tools have issues with team linking):

**API (RECOMMENDED - ensures team_id is set):**
```bash
# Team ID for vibe-kanban: c1a926de-0683-407d-81de-124e0d161ec5
TEAM_ID="c1a926de-0683-407d-81de-124e0d161ec5"
PROJECT_ID="de246043-3b27-45e4-bd7a-f0d685b317d0"  # backend

curl -s -X POST "http://localhost:3003/api/tasks" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"VIB-XX: Task title\",
    \"project_id\": \"$PROJECT_ID\",
    \"team_id\": \"$TEAM_ID\",
    \"status\": \"inprogress\",
    \"description\": \"Task description\"
  }" | jq .
```

**Project IDs:**
| Project | ID |
|---------|-----|
| frontend | `ba7fe592-42d0-43f5-add8-f653054c2944` |
| backend | `de246043-3b27-45e4-bd7a-f0d685b317d0` |
| integration | `bde6ec12-2cf1-4784-9a0e-d03308ade450` |
| database | `731d6e37-9223-4595-93a0-412a38af4540` |

**CLI Alternative:**
```bash
./mcp/cli.py create <project> "Task title" --team vibe-kanban --status inprogress -d "Description"
```

#### 2. 🚨 Create Planning Documents (MANDATORY - DO NOT SKIP)

**BEFORE writing ANY code**, create both documents in the external docs folder:

```bash
# Base path: /Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/{task_type}/
# Where {task_type} is: frontend, backend, or integration

# Example for backend task VIB-71:
# /Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/backend/VIB-71-backup-flow.md
# /Users/rupeshpanwar/Documents/docs/docs-vibe-kanban/planning/backend/VIB-71-backup-plan.md
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
