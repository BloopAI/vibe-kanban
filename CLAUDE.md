# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context Commands

| Command | Purpose |
|---------|---------|
| `/context` | Full context: project state + techstack + tasks |
| `/techstack` | Package versions, imports, env vars |
| `/patterns` | Code conventions, component patterns |
| `/api` | API endpoints, request/response formats |
| `/docs <term>` | Search project documentation |

## Tech Context Files (in .claude/)

| File | Contents |
|------|----------|
| `TECHSTACK.md` | Package versions, imports, env vars |
| `PATTERNS.md` | Component, hook, handler patterns |
| `API.md` | All API endpoints with examples |

## Project Documentation

**Location:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban/`

- `INDEX.md` - Documentation navigation
- `PROJECT-STATUS.md` - Current project state
- `architecture/` - System design docs

## Quick Reference

**Backend:** `cd vibe-backend && cargo run --bin server`
**Frontend:** `cd vibe-frontend && pnpm dev`
**SQLx cache:** `cd vibe-backend/crates/db && cargo sqlx prepare`
**Lint:** `cd vibe-frontend && pnpm lint`

## Core Rules

- **UI**: shadcn/ui only (`npx shadcn-ui@latest add <component>`)
- **Auth**: Clerk only (modal sign-in, not full-page)
- **SQLx types**: `DateTime<Utc>` → `TIMESTAMPTZ`, `i64` → `bigint`
- **CI**: Commit `.sqlx/` cache files (CI uses `SQLX_OFFLINE=true`)

## /full-stack-dev Workflow

When `/full-stack-dev` is invoked, follow phases in order:
1. Create task: `python3 mcp/ikanban.py create IKA "title" -s inprogress`
2. Create planning docs in `docs-ikanban/planning/`
3. TDD: Red → Green → Refactor
4. E2E test → Git workflow → Mark task done

## Task Management

```bash
python3 mcp/ikanban.py create IKA "title" -s inprogress
python3 mcp/ikanban.py update IKA-27 --status done
python3 mcp/ikanban.py issues IKA
```

Teams: `IKA` (frontend), `SCH` (backend)

## Detailed Rules (read when needed)

`.agent/rules/`: Agent.md, SQLxQueryCache.md, Migration.md, ui-components.md, authentication-clerk.md

## Architecture

**Backend crates:** `server`, `db`, `services`, `executors`, `deployment`, `local-deployment`, `remote`, `review`

**Frontend:** React 18, Vite, TailwindCSS v4, Zustand, TanStack Query v5

**Deploy:** GitHub Actions → Docker Hub → Railway
