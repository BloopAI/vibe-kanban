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

## /full-stack-dev Workflow (8 Phases)

When `/full-stack-dev` is invoked, follow all 8 phases in order:

| Phase | Action | Key Points |
|-------|--------|------------|
| 1 | Task Setup | Create task with `-d "description"` |
| 2 | Planning Docs | Create flow.md + plan.md in docs-ikanban |
| 3 | Feature Branch | `git checkout -b feature/IKA-XX-name` |
| 4 | Implementation | Code + lint + type check |
| 5 | Write Tests | Playwright tests in vibe-testing |
| 6 | Run Tests | All tests must pass |
| 7 | Git Merge | Push, merge to main, cleanup branch |
| 8 | Task Done | Add summary comment, then mark done |

## Task Management

```bash
# Create task (ALWAYS include description!)
python3 mcp/ikanban.py create IKA "title" -s inprogress -d "what, why, acceptance criteria"

# List tasks
python3 mcp/ikanban.py issues IKA

# Add completion summary (use COMMENT, not description update)
python3 mcp/ikanban.py comment IKA-XX "Summary: what was done, key changes, test status"

# Mark done (do NOT use -d flag here)
python3 mcp/ikanban.py update IKA-XX --status done
```

**Important:** Description is set at creation. Use comments for completion summaries.

Teams: `IKA` (frontend), `SCH` (backend)

## Detailed Rules (read when needed)

`.agent/rules/`: Agent.md, SQLxQueryCache.md, Migration.md, ui-components.md, authentication-clerk.md

## Architecture

**Backend crates:** `server`, `db`, `services`, `executors`, `deployment`, `local-deployment`, `remote`, `review`

**Frontend:** React 18, Vite, TailwindCSS v4, Zustand, TanStack Query v5

**Deploy:** GitHub Actions → Docker Hub → Railway
