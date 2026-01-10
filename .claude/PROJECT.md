# iKanban Project Context

## Project Info

| Field | Value |
|-------|-------|
| Name | iKanban (Vibe Kanban) |
| Team ID | `a263e43f-43d3-4af7-a947-5f70e6670921` |
| Identifier | `IKA` |
| Type | Full-stack Kanban + AI Agent Orchestration |

## Paths

| Path | Purpose |
|------|---------|
| **Project Root** | `/Users/rupeshpanwar/Documents/Projects/iKanban` |
| **Documentation** | `/Users/rupeshpanwar/Documents/docs/docs-ikanban/` |
| **Backend** | `vibe-backend/` |
| **Frontend** | `vibe-frontend/` |
| **MCP Tools** | `mcp/` |

## URLs

| Environment | URL |
|-------------|-----|
| Production Frontend | https://ikanban.scho1ar.com |
| Production API | https://api.scho1ar.com |
| Local Frontend | http://localhost:3000 |
| Local Backend | http://localhost:3001 |

## Tech Stack

### Backend (Rust)
- **Framework**: Axum 0.8.4
- **Runtime**: Tokio
- **Database**: SQLx + Supabase (Postgres)
- **Schema**: Drizzle ORM

### Frontend (React)
- **Build**: Vite
- **UI**: shadcn/ui (Radix + Tailwind v4)
- **State**: Zustand + TanStack Query v5
- **Auth**: Clerk

## Projects

| Project | ID | Default |
|---------|-----|---------|
| frontend | `ff89ece5-eb49-4d8b-a349-4fc227773cbc` | Yes |
| backend | (use `issues IKA` to find) | No |
| integration | (use `issues IKA` to find) | No |

## Quick Commands

```bash
# Development
cd vibe-backend && cargo run --bin server
cd vibe-frontend && pnpm dev

# Checks
cd vibe-frontend && pnpm lint && pnpm check
cd vibe-backend && cargo check

# SQLx cache (after schema changes)
cd vibe-backend/crates/db && cargo sqlx prepare

# Task management
python3 mcp/ikanban.py create IKA "title" -s inprogress
python3 mcp/ikanban.py update IKA-XX --status done
python3 mcp/ikanban.py issues IKA
```

## Documentation Structure

```
docs-ikanban/
├── INDEX.md              # Navigation
├── PROJECT-STATUS.md     # Current state
├── frontend/             # Frontend task docs (IKA-XX-*-flow.md, IKA-XX-*-plan.md)
├── backend/              # Backend task docs
├── integration/          # Cross-cutting task docs
├── architecture/         # System design
└── less-token/           # Token optimization guide
```

## Core Rules

1. **UI**: shadcn/ui only
2. **Auth**: Clerk only (modal sign-in)
3. **SQLx**: `DateTime<Utc>` → `TIMESTAMPTZ`, `i64` → `bigint`
4. **CI**: Commit `.sqlx/` cache files

## Context Files

| File | Purpose |
|------|---------|
| `PROJECT.md` | This file - project info |
| `WORKFLOW.md` | TDD workflow phases |
| `TECHSTACK.md` | Package versions |
| `PATTERNS.md` | Code conventions |
| `API.md` | API endpoints |
