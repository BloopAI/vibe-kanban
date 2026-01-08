# Agent Documentation Index

This is the central reference for AI assistants working on the iKanban project. **Read this first** to understand where to find project documentation and guidelines.

## Quick Reference

| Category | Location | Purpose |
|----------|----------|---------|
| **Rules** | `/.agent/rules/` | AI behavior guidelines, project context, technical rules |
| **Workflows** | `/.agent/workflows/` | Standard operating procedures for common tasks |
| **Docs** | `/Users/rupeshpanwar/Documents/docs/docs-ikanban/` | Architecture, feature docs, planning |
| **MCP Tools** | `/mcp/` | Custom MCP tools (vk, supabase_db_util) |

---

## Rules (`/.agent/rules/`)

| File | Purpose |
|------|---------|
| [`Agent.md`](rules/Agent.md) | AI behavior rules - permission protocols, scope adherence |
| [`Context.md`](rules/Context.md) | Project architecture, infrastructure, dependencies |
| [`Migration.md`](rules/Migration.md) | Database migration procedures |
| [`SQLxQueryCache.md`](rules/SQLxQueryCache.md) | SQLx compile-time query caching for CI builds |

---

## Workflows (`/.agent/workflows/`)

| File | Slash Command | Purpose |
|------|---------------|---------|
| [`feature-development.md`](workflows/feature-development.md) | `/feature-development` | End-to-end feature development SOP |
| [`database-update.md`](workflows/database-update.md) | `/database-update` | Supabase schema updates with Drizzle ORM |

---

## Project Structure

```
vibe-kanban/
├── .agent/              # AI agent configuration
│   ├── README.md        # THIS FILE - read first
│   ├── workflows/       # Standard operating procedures
│   └── rules/           # AI behavior rules & project context
├── mcp/                 # MCP tools (vk task manager, supabase utils)
├── vibe-frontend/       # React/Vite frontend
├── vibe-backend/        # Rust/Axum backend
│   ├── crates/
│   │   ├── db/          # Main database crate (Supabase)
│   │   └── remote/      # Cloud deployment crate (separate schema)
│   └── schema/          # Drizzle schema definitions
└── .github/workflows/   # CI/CD pipelines
```

---

## Key Technical Context

### Database
- **Type:** Supabase Postgres  
- **ORM:** Drizzle (TypeScript) + SQLx (Rust)
- **Schema location:** `/vibe-backend/schema/schema.pg.ts`

### CI/CD
- **Platform:** GitHub Actions → Docker Hub → Railway
- **SQLx Mode:** Offline (`SQLX_OFFLINE=true`) - requires cached queries
- **Cache location:** `/vibe-backend/crates/db/.sqlx/`

### Important Constraints
- Never hardcode credentials - use environment variables
- Always regenerate SQLx cache after schema/query changes
- Backend builds on Linux (not macOS) due to linker issues

---

## Before Starting Work

1. **Read** `rules/Agent.md` for behavior guidelines
2. **Check** `rules/Context.md` for architecture understanding
3. **Follow** appropriate workflow in `.agent/workflows/`
4. **Reference** `rules/SQLxQueryCache.md` if touching database code
