# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibe Kanban is a task orchestration tool for AI coding agents (Claude Code, Gemini CLI, Copilot, etc.). It provides a Kanban board interface for managing AI-assisted development tasks with Git worktree isolation.

**Tech Stack:**
- Backend: Rust with Axum web framework, SQLx for SQLite
- Frontend: React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui
- Shared types: Auto-generated from Rust to TypeScript using ts-rs
- Monorepo: pnpm workspaces

## Common Development Commands

### Full-Stack Development
```bash
pnpm dev              # Start both frontend and backend in watch mode
pnpm build            # Build both frontend and backend for production
pnpm build:npm        # Create NPM distributable package
```

### Backend Development
```bash
pnpm backend:dev      # Run backend with hot reload
cargo test --manifest-path backend/Cargo.toml                    # Run all backend tests
cargo test --manifest-path backend/Cargo.toml test_name          # Run single test
cargo test --manifest-path backend/Cargo.toml module_name::      # Run module tests
cargo test --manifest-path backend/Cargo.toml -- --nocapture     # Show test output
npm run prepare-db    # Fix SQLX compile issues (regenerate .sqlx cache)
```

### Frontend Development
```bash
pnpm frontend:dev     # Run frontend dev server
cd frontend && npm run lint          # Run ESLint
cd frontend && npm run lint:fix      # Fix ESLint issues
cd frontend && npm run format        # Run Prettier
cd frontend && npm run build         # Build frontend
```

### Type Generation
```bash
pnpm generate-types        # Generate TypeScript types from Rust structs
pnpm generate-types:check  # Verify types are up to date
```

## Architecture & Code Organization

### Backend Structure (`/backend/src/`)
- **`executors/`** - AI agent integrations (Claude, Gemini, Amp, Copilot)
  - Each executor implements the `Executor` trait
  - Handles agent-specific command formatting and execution
- **`models/`** - Database entities and queries using SQLx
  - All database operations should be in model files
  - Uses async SQLx queries with prepared statements
- **`routes/`** - Axum API endpoints
  - RESTful API design with JSON request/response
  - Server-sent events for real-time updates
- **`services/`** - Business logic
  - `git_service.rs` - Git operations and worktree management
  - `github_service.rs` - GitHub API integration
  - `notification_service.rs` - OS notifications
- **`mcp/`** - Model Context Protocol server implementation

### Frontend Structure (`/frontend/src/`)
- **`components/`** - React components organized by feature
  - Uses shadcn/ui components as base
  - Functional components with TypeScript
- **`pages/`** - Route-level components
- **`lib/`** - Utilities and API client
  - `api.ts` - Centralized API calls
  - `types.ts` - Imported from shared types
- **`hooks/`** - Custom React hooks

### Key Implementation Details

1. **Git Worktree Management**
   - Each task attempt gets its own worktree with isolated branch
   - WorktreeManager handles thread-safe creation and cleanup
   - Special handling for WSL2 compatibility issues

2. **Type Safety**
   - Rust structs with `#[derive(TS)]` generate TypeScript types
   - Run `pnpm generate-types` after modifying Rust types
   - Never manually edit `shared/types.ts`

3. **Database**
   - SQLite with SQLx for compile-time query verification
   - Migrations in `backend/migrations/`
   - Database stored in platform-specific app data directory

4. **Real-time Updates**
   - Server-sent events (SSE) for task status updates
   - Frontend auto-reconnects on connection loss

## Code Style Guidelines

- **Rust**: Standard rustfmt, snake_case naming
- **TypeScript**: Strict mode enabled, use @/ path aliases
- **React**: Functional components only, use hooks
- **CSS**: Tailwind utility classes, avoid custom CSS
- **File naming**: kebab-case for files, PascalCase for components

## Environment Variables

The app uses minimal environment configuration:
- `BACKEND_PORT` or `PORT`: Backend server port (defaults to auto-assign)
- `HOST`: Backend host (defaults to "127.0.0.1")

Configuration is stored in a JSON file managed through the API, not .env files.

## Important Notes

1. When implementing full-stack features, start with the backend API first
2. All database queries must be in the models directory
3. Use the existing executor pattern when adding new AI agent integrations
4. Frontend has no test setup currently - only linting available
5. The project is distributed as `npx vibe-kanban` - ensure changes work in NPX context