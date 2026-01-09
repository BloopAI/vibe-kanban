# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory Workflow Rules

> **⚠️ CRITICAL: These rules are NON-NEGOTIABLE when `/full-stack-dev` is invoked ⚠️**

When `/full-stack-dev` skill is invoked:

1. **STOP** - Do not write any code immediately
2. **Create task in iKanban FIRST** - Use CLI: `python cli.py create IKA "task title" -s inprogress`
3. **Create planning docs BEFORE coding**:
   - ASCII Flow Diagram: `docs-ikanban/planning/<type>/<task-id>-<feature>-flow.md`
   - Implementation Plan: `docs-ikanban/planning/<type>/<task-id>-<feature>-plan.md`
4. **Write failing tests BEFORE implementation** (TDD Red phase)
5. **Never skip phases** - All 6 phases must be completed in order

```
Phase 1: Task Setup     → Create task in iKanban
Phase 2: Planning Docs  → Create flow diagram + implementation plan
Phase 3: TDD            → 🔴 Write failing tests → 🟢 Implement → 🔵 Refactor
Phase 4: E2E Testing    → Test API with curl + Test UI flow
Phase 5: Git Workflow   → Branch, commit, merge
Phase 6: Task Done      → Link docs, mark complete
```

**Violations result in:**
- Task marked INCOMPLETE regardless of code status
- Must complete missing phases before closure
- Rework required if TDD was skipped

---

## Project Overview

Vibe Kanban (iKanban) is a full-stack kanban board application with AI-powered task execution. The project uses a Rust/Axum backend with React/Vite frontend.

## Build & Development Commands

### Backend (Rust/Axum)
```bash
cd vibe-backend

# Development
cargo run --bin server              # Start backend (default port 3003)
cargo check                         # Type check without building
cargo build --release --bin server  # Build release binary
```

> **Note:** For cloud deployment, the backend runs at `api.scho1ar.com`. Local backend is only needed for local-only development.

### Frontend (React/Vite)
```bash
cd vibe-frontend

pnpm install                        # Install dependencies
pnpm dev                            # Start dev server (default port 3000)
pnpm build                          # Production build
pnpm check                          # TypeScript type check
pnpm lint                           # Run ESLint
pnpm lint:fix                       # Fix lint errors
pnpm format                         # Format with Prettier
```

### SQLx Query Cache (Required for CI)
When modifying database queries or schema:
```bash
cd vibe-backend/schema
npx drizzle-kit push:pg             # Push schema to Supabase

cd vibe-backend/crates/db
cargo sqlx prepare                  # Regenerate SQLx cache

git add crates/db/.sqlx/
git commit -m "chore: update sqlx query cache"
```

## Architecture

### Backend Structure (`vibe-backend/crates/`)
| Crate | Purpose |
|-------|---------|
| `server` | Axum HTTP server, routes, middleware |
| `db` | Database models, SQLx queries (Supabase) |
| `services` | Business logic, config management |
| `executors` | AI agent execution profiles |
| `deployment` | Deployment trait abstraction |
| `local-deployment` | Local development deployment impl |
| `remote` | Cloud multi-tenant deployment (separate schema) |
| `utils` | Shared utilities |
| `review` | Code review functionality |

### Frontend Structure (`vibe-frontend/src/`)
- `components/` - React components (shadcn/ui based)
- `pages/` - Route page components
- `hooks/` - Custom React hooks
- `contexts/` - React context providers
- `lib/` - Utility libraries
- `stores/` - Zustand state stores
- `i18n/` - Internationalization

### Key Technologies
- **Backend**: Rust, Axum, SQLx, Tokio
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui, TanStack Query
- **Database**: Supabase (Postgres), Drizzle ORM for schema
- **Auth**: Clerk
- **CI/CD**: GitHub Actions → Docker Hub → Railway

## Important Patterns

### Database & SQLx
- Uses **SQLx compile-time verification** with offline mode for CI (`SQLX_OFFLINE=true`)
- SQLx cache files in `crates/db/.sqlx/` must be committed
- When LEFT JOINs return nullable columns, ensure `.sqlx` cache has `"nullable": [true]`
- Type hints in queries: `SELECT id as "id!: Uuid", created_at as "created_at!: DateTime<Utc>"`

### Postgres Type Mappings
- `DateTime<Utc>` → `TIMESTAMPTZ` (not `timestamp`)
- `i64` → `bigint` (not `integer`)
- Enums stored as `TEXT` need `impl Display`

### Frontend Components
- Use **shadcn/ui components only** - install via `npx shadcn-ui@latest add <component>`
- Components in `src/components/ui/`
- Style with Tailwind classes via `className` prop

### Authentication
- **Clerk only** for auth
- Protected routes redirect to sign-in
- Use Clerk hooks: `useAuth`, `useUser`
- Server-side verify ownership before data operations

## CI/CD Pipeline

The backend deploys via GitHub Actions when changes push to `main`:
1. Build Rust binary on Ubuntu (Linux required - macOS has linker issues)
2. Package into Docker image using `Dockerfile.deploy`
3. Push to Docker Hub
4. Deploy to Railway

Environment variables:
- `SQLX_OFFLINE=true` - Required for CI builds without DB access
- `CLOUD_DEPLOYMENT=true` - Skip local app disclaimers in cloud

## Agent Rules

Reference `.agent/rules/` for detailed guidelines:
- **Agent.md**: Ask before implementing exploratory questions
- **SQLxQueryCache.md**: When/how to regenerate query cache
- **Migration.md**: Postgres strict typing rules
- **ui-components.md**: shadcn/ui only
- **authentication-clerk.md**: Clerk auth patterns

## MCP Tools & Task Management

Custom MCP tools in `/mcp/` for task management. Two interfaces available:

### CLI Interface (Recommended)

```bash
cd mcp/

# List teams and issues
python cli.py teams                              # List all teams
python cli.py issues IKA                         # List iKanban issues
python cli.py issues SCH --status inprogress    # List Schild in-progress

# Create issues
python cli.py create IKA "Fix login bug"                    # Create in iKanban
python cli.py create SCH "Add feature" --project backend    # Create in Schild
python cli.py create IKA "Urgent fix" -p 1 -s inprogress   # Priority 1, in-progress

# Update tasks
python cli.py update <task-id> --status done               # Mark done
python cli.py update <task-id> -s inprogress -d "WIP"     # Status + description

# Get task details
python cli.py task <task-id>                               # Get task info
python cli.py task <task-id> --json                        # JSON output
```

### JSON-RPC Interface (Alternative)

For programmatic access or when CLI has issues:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vk_create_issue","arguments":{"team":"IKA","title":"My task","status":"inprogress"}}}' | \
VIBE_API_TOKEN="vk_..." python3 mcp/server.py
```

Available tools via JSON-RPC:
- `vk_list_teams` - List all teams
- `vk_list_projects` - List all projects
- `vk_list_issues` - List issues for a team
- `vk_create_issue` - Create new issue
- `vk_update_task` - Update task status/description
- `vk_get_task` - Get task details

### Teams Reference

| Team | Identifier | Default Project |
|------|------------|-----------------|
| iKanban | `IKA` | frontend |
| Schild | `SCH` | backend |

### Environment Setup

Ensure `VIBE_API_TOKEN` is set in `.env`:
```
VIBE_API_TOKEN=vk_your_token_here
```
