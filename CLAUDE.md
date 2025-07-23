# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `pnpm run dev` - Start both frontend (port 3000) and backend (port 3001) with live reload
- `pnpm run check` - Run cargo check and TypeScript type checking - **always run this before committing**
- `pnpm run generate-types` - Generate TypeScript types from Rust structs (run after modifying Rust types)

### Testing and Validation
- `pnpm run frontend:dev` - Start frontend development server only
- `pnpm run backend:dev` - Start Rust backend only
- `cargo test` - Run Rust unit tests from backend directory
- `cargo fmt` - Format Rust code
- `cargo clippy` - Run Rust linter

### Building
- `./build-npm-package.sh` - Build production package for distribution
- `cargo build --release` - Build optimized Rust binary

## Architecture Overview

### Tech Stack
- **Backend**: Rust with Axum web framework, SQLite + SQLX, Tokio async runtime
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, Radix UI
- **Package Management**: pnpm workspace monorepo
- **Type Sharing**: Rust types exported to TypeScript via `ts-rs`

### Core Concepts

**Vibe Kanban** is an AI coding agent orchestration platform that manages multiple coding agents (Claude Code, Gemini CLI, Amp, etc.) through a unified interface.

**Project Structure**:
- `/backend/src/` - Rust backend with API endpoints, database, and agent executors
- `/frontend/src/` - React frontend with task management UI
- `/backend/migrations/` - SQLite database schema migrations
- `/shared-types/` - Generated TypeScript types from Rust structs

**Executor System**: Each AI agent is implemented as an executor in `/backend/src/executors/`:
- `claude.rs` - Claude Code integration
- `gemini.rs` - Google Gemini CLI
- `amp.rs` - Amp coding agent  
- `dev_server.rs` - Development server management
- `echo.rs` - Test/debug executor

**Key Backend Modules**:
- `/backend/src/api/` - REST API endpoints
- `/backend/src/db/` - Database models and queries
- `/backend/src/github/` - GitHub OAuth and API integration
- `/backend/src/git/` - Git operations and worktree management
- `/backend/src/mcp/` - Model Context Protocol server implementation

### Database Schema
SQLite database with core entities:
- `projects` - Coding projects with GitHub repo integration
- `tasks` - Individual tasks assigned to executors
- `processes` - Execution processes with streaming logs
- `github_users`, `github_repos` - GitHub integration data

### API Architecture
- RESTful endpoints at `/api/` prefix
- WebSocket streaming for real-time task updates at `/api/stream/:process_id`
- GitHub OAuth flow with PKCE
- MCP server exposed for external tool integration

## Development Guidelines

### Type management
- First ensure that `src/bin/generate_types.rs` is up to date with the types in the project
- **Always regenerate types after modifying Rust structs**: Run `pnpm run generate-types`
- Backend-first development: Define data structures in Rust, export to frontend
- Use `#[derive(Serialize, Deserialize, PartialEq, Debug, Clone, TS)]` for shared types

### Code Style
- **Rust**: Use rustfmt, follow snake_case naming, leverage tokio for async operations
- **TypeScript**: Strict mode enabled, use `@/` path aliases for imports
- **React**: Functional components with hooks, avoid class components

### Git Integration Features
- Automatic branch creation per task
- Git worktree management for concurrent development
- GitHub PR creation and monitoring
- Commit streaming and real-time git status updates

### MCP Server Integration
Built-in MCP server provides task management tools:
- `create_task`, `update_task`, `delete_task`
- `list_tasks`, `get_task`, `list_projects`
- Requires `project_id` for most operations

### Process Execution
- All agent executions run as managed processes with streaming logs
- Process lifecycle: queued → running → completed/failed
- Real-time updates via WebSocket connections
- Automatic cleanup of completed processes

### Environment Configuration
- Backend runs on port 3001, frontend proxies API calls in development
- GitHub OAuth requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Optional PostHog analytics integration
- Rust nightly toolchain required (version 2025-05-18 or later)

## Testing Strategy
- Run `pnpm run check` to validate both Rust and TypeScript code
- Use `cargo test` for backend unit tests
- Frontend testing focuses on component integration
- Process execution testing via echo executor

## Key Dependencies
- **axum** - Web framework and routing
- **sqlx** - Database operations with compile-time query checking  
- **octocrab** - GitHub API client
- **rmcp** - MCP server implementation
- **@dnd-kit** - Drag-and-drop task management
- **react-router-dom** - Frontend routing
