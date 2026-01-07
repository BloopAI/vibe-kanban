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

## Deployment

### Railway Deployment

The application is deployed to Railway with separate projects for backend API and frontend.

| Service | Project ID | Service ID | Environment ID | URL |
|---------|------------|------------|----------------|-----|
| **Backend** | `9661a956-d8c2-4bd2-a16b-05e320b85965` | `db8a22cf-beb2-4d00-bc0e-0e80c1e1e661` | `439b9533-a138-4982-8407-ada14aca9a1f` | https://api.scho1ar.com |
| **Frontend** | `af8b1a5e-f0e0-4640-96ba-298335a85d48` | `fd827df3-1f51-483c-a798-7c5d39610c46` | `7dd40b1a-0e61-4069-9f41-e008d9444e85` | https://app.scho1ar.com |

**Deploy script**: `./mcp/deploy.py`

```bash
# Deploy both backend and frontend
./mcp/deploy.py

# Deploy only backend
./mcp/deploy.py --backend

# Deploy only frontend
./mcp/deploy.py --frontend

# Deploy in background (detached)
./mcp/deploy.py --detach

# View backend logs
./mcp/deploy.py --logs
```

**Required environment variables** (set in Railway dashboard):

Backend:
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `ENABLE_API_AUTH` - Set to `true` to enable JWT authentication
- `CLERK_DOMAIN` - Clerk domain for JWT validation (e.g., `welcome-swift-76.clerk.accounts.dev`)

Frontend:
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `VITE_API_URL` - Backend API URL (https://api.scho1ar.com)

## Task Management Workflow (Vibe Kanban MCP)

Use the Vibe Kanban MCP tools to manage tasks for this project.

### Data Model

**Team: vibe-kanban** - All work is tracked under this team
- **Issues/Tasks** - Created and mapped to projects
- **Documents** - Stored in folders as markdown files
- **Projects** - Categorize work by area (frontend, backend, integration)

> **Note**: Team and Project IDs below are for current development database. Use `vk_list_teams` and `vk_list_projects` to get current IDs if they change.

### Available Projects (under vibe-kanban team)

| Project | ID | Use For |
|---------|-----|---------|
| **frontend** | `ba7fe592-42d0-43f5-add8-f653054c2944` | React/TypeScript UI work |
| **backend** | `de246043-3b27-45e4-bd7a-f0d685b317d0` | Rust API/server work |
| **integration** | `bde6ec12-2cf1-4784-9a0e-d03308ade450` | Cross-cutting/integration work |
| **database** | `731d6e37-9223-4595-93a0-412a38af4540` | SQLx migrations, models |
| **ai** | `ffa3f7db-bf84-4e88-b04d-59f5f98a0522` | AI/ML related work |

### Document Folders

Planning documents are stored in the external docs folder configured via environment or Claude Code settings.

**Default path**: `$DOCS_VIBE_KANBAN` (e.g., `/path/to/docs-vibe-kanban/`)

| Task Type | Subfolder |
|-----------|-----------|
| **frontend** | `planning/frontend/` |
| **backend** | `planning/backend/` |
| **integration** | `planning/integration/` |

Use markdown format for all documents.

### 🚨 MANDATORY REQUIREMENTS - NO EXCEPTIONS 🚨

> **⚠️ VIOLATIONS WILL RESULT IN TASK REJECTION AND REWORK ⚠️**
>
> These requirements are NON-NEGOTIABLE. Tasks missing these steps are INCOMPLETE.

#### 1. Planning Documents (REQUIRED for EVERY task)

**BEFORE writing ANY code**, create BOTH documents in the external docs folder:

**Base Path**: `$DOCS_VIBE_KANBAN/planning/{task_type}/`

| Document | Filename | Purpose |
|----------|----------|---------|
| **Flow Diagram** | `VIB-XX-feature-flow.md` | ASCII diagram showing data flow, component relationships |
| **Implementation Plan** | `VIB-XX-feature-plan.md` | Step-by-step plan with affected files, changes needed |

**Example for backend task**:
- `$DOCS_VIBE_KANBAN/planning/backend/VIB-71-backup-flow.md`
- `$DOCS_VIBE_KANBAN/planning/backend/VIB-71-backup-plan.md`

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

> **IMPORTANT: Task Naming Convention**
> - **DO NOT** include `VIB-XX:` prefix in the task title
> - The app auto-generates issue numbers (VIB-1, VIB-2, VIB-3...)
> - Use the returned `issue_number` for planning docs and branch names

Use the **MCP tools** or **API** to create team issues:

**MCP (preferred):**
```
vk_create_issue(title="Add user preferences page", project="backend", team="vibe-kanban", status="inprogress")
```
Response includes `issue_number: 5` → Task displays as **VIB-5: Add user preferences page**

**API Alternative:**
```bash
# Get current IDs: vk_list_teams, vk_list_projects
TEAM_ID="<team-uuid>"
PROJECT_ID="<project-uuid>"

curl -s -X POST "http://localhost:3003/api/tasks" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Add user preferences page\",
    \"project_id\": \"$PROJECT_ID\",
    \"team_id\": \"$TEAM_ID\",
    \"status\": \"inprogress\",
    \"description\": \"Task description\"
  }" | jq '.data.issue_number'
```
Extract `issue_number` from response for use in planning docs.

**CLI Alternative:**
```bash
./mcp/cli.py create <project> "Task title" --team vibe-kanban --status inprogress -d "Description"
```

#### 2. 🚨 Create Planning Documents (MANDATORY - DO NOT SKIP)

**AFTER creating the task** (to get the issue number), create both documents:

```bash
# Base path: $DOCS_VIBE_KANBAN/planning/{task_type}/
# Where {task_type} is: frontend, backend, or integration

# Use the ACTUAL issue_number from task creation response!
# If task was created as VIB-5:
# $DOCS_VIBE_KANBAN/planning/backend/VIB-5-user-preferences-flow.md
# $DOCS_VIBE_KANBAN/planning/backend/VIB-5-user-preferences-plan.md
```

**Wrong vs Correct Naming:**
| Wrong | Correct |
|-------|---------|
| `title: "VIB-86: Add feature"` | `title: "Add feature"` |
| Planning doc before task | Create task first, get issue_number |
| `VIB-XX-feature.md` (guessed) | `VIB-5-feature.md` (actual number) |

#### 3. Create Feature Branch

Use the issue number from step 1 for the branch name:

```bash
git checkout main
git pull origin main
git checkout -b feature/VIB-<issue_number>-<task-name-kebab-case>
# Example (if issue_number is 5): git checkout -b feature/VIB-5-user-preferences
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
git push -u origin feature/VIB-<issue_number>-<task-name-kebab-case>
# Example: git push -u origin feature/VIB-5-user-preferences
```

#### 7. Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/VIB-<issue_number>-<task-name-kebab-case>
git push origin main
```

#### 8. Clean Up Feature Branch

```bash
git branch -d feature/VIB-<issue_number>-<task-name-kebab-case>
git push origin --delete feature/VIB-<issue_number>-<task-name-kebab-case>
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
vk_create_issue(title="Add dark mode toggle", project="frontend", team="vibe-kanban", status="inprogress")
```
> **Remember:** Do NOT include `VIB-XX:` prefix. The app auto-generates the issue number.

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
