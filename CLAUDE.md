# CLAUDE.md - Vibe Kanban Development Guide

## 1. Core Principles

- **Type Safety First**: All data structures must be typed. Use Rust's type system and TypeScript strict mode.
- **Single Source of Truth**: Rust types are authoritative. Run `npm run generate-types` after modifying Rust structs.
- **Error Transparency**: Use `thiserror` with `#[from]` for error propagation. Never swallow errors silently.
- **Stateless Services**: Service structs should be stateless and `Clone`. Pass dependencies via function parameters.
- **UUID Identifiers**: All entities use UUID v4 for primary keys.
- **UTC Timestamps**: All timestamps stored as `DateTime<Utc>` (Rust) and ISO 8601 strings (JSON/SQLite).
- **GitHub Targeting**: Open pull requests only against `davidrudduck/vk-swarm`. Do not open PRs against `BloopAI/vibe-kanban` from this workspace.

## 2. Tech Stack

### Backend
- **Language**: Rust (Edition 2024)
- **Framework**: Axum 0.8 with Tokio async runtime
- **Database**: SQLite with SQLx (compile-time checked queries)
- **Error Handling**: `thiserror` for custom errors, `anyhow` for ad-hoc errors
- **Type Generation**: `ts-rs` for Rust → TypeScript
- **Logging**: `tracing` crate with structured logging
- **Linting**: Clippy with `-D warnings`
- **Formatting**: `cargo fmt`

### Frontend
- **Framework**: React 18 with TypeScript (strict mode)
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: React Context API + TanStack React Query
- **i18n**: i18next (en, ja, ko, es)
- **Linting**: ESLint 8.55
- **Formatting**: Prettier

### Package Management
- **Node**: pnpm 10.x (required)
- **Rust**: Cargo workspace

## 3. Architecture

### Backend Structure (`crates/`)
```text
server/           # Axum HTTP server, routes, MCP server
├── routes/       # HTTP handlers (directory modules for complex domains)
│   ├── task_attempts/  # Directory module with handlers/, types.rs
│   ├── projects/       # Directory module with handlers/, types.rs
│   └── *.rs            # Simple routes (single file per domain)
├── mcp/          # Model Context Protocol server
├── middleware/   # Auth, request handling
└── error.rs      # Global API error types

db/               # Database layer
├── models/       # SQLx models (directory modules for complex models)
│   ├── task/           # Directory module: queries.rs, archive.rs, sync.rs, hierarchy.rs
│   ├── project/        # Directory module: queries.rs, github.rs, stats.rs, sync.rs
│   ├── execution_process/  # Directory module: queries.rs, lifecycle.rs, sync.rs
│   ├── log_entry/      # Directory module: queries.rs, pagination.rs, sync.rs
│   └── *.rs            # Simple models (single file)
└── migrations/   # SQL migration files

services/         # Business logic (stateless)
├── git.rs        # Git operations
├── github.rs     # GitHub API integration
└── worktree.rs   # Worktree management

executors/        # AI agent integrations
├── logs/         # Log processing
│   ├── normalizer.rs  # LogNormalizer trait and driver function
│   ├── tool_states.rs # Shared tool state structures
│   └── *.rs           # Executor-specific implementations
└── *.rs          # Executor implementations (ACP, Droid, Codex)

utils/            # Shared utilities, ApiResponse
```

### Frontend Structure (`frontend/src/`)
```text
components/       # Organized by domain
├── projects/     # ProjectCard, ProjectForm, etc.
├── tasks/        # TaskCard, TaskList, etc.
└── ui/           # shadcn/ui base components

pages/            # Route pages (one file per route)
hooks/            # Custom hooks (60+ hooks by domain)
contexts/         # React context providers
lib/              # API client, utilities
├── api.ts        # API namespace objects
└── utils.ts      # Helper functions
```

### Data Flow
```text
Frontend Component
    ↓ (API call)
lib/api.ts (fetch wrapper)
    ↓ (HTTP)
routes/*.rs (Axum handlers)
    ↓ (business logic)
services/*.rs (stateless services)
    ↓ (data access)
db/models/*.rs (SQLx queries)
    ↓
SQLite Database
```

## 4. Code Style

### Rust Naming
```rust
// Enums: PascalCase, serialize as snake_case
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

// Structs: PascalCase
pub struct Project { ... }
pub struct CreateProject { ... }  // Request types
pub struct ProjectError { ... }   // Error types

// Functions: snake_case
pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Project, sqlx::Error>
pub async fn get_projects(State(deployment): State<DeploymentImpl>) -> Result<...>
```

### TypeScript Naming
```typescript
// Components: PascalCase files and exports
// File: ProjectCard.tsx
function ProjectCard({ project, isFocused }: Props) { ... }
export default ProjectCard;

// Hooks: camelCase with 'use' prefix
// File: useProjectMutations.ts
export function useProjectMutations(options?: Options) { ... }

// Types: PascalCase
type Props = { project: Project; isFocused: boolean; };
interface UserSystemContextType { ... }

// Variables/functions: camelCase
const [loading, setLoading] = useState(true);
const fetchProjects = async () => { ... };
```

### Callbacks Convention
```typescript
// Options interfaces use on{Action}, on{Action}Success, on{Action}Error
interface UseProjectMutationsOptions {
  onCreateSuccess?: (project: Project) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (project: Project) => void;
  onUpdateError?: (err: unknown) => void;
}
```

## 5. Logging

### Backend (Rust)
```rust
use tracing::{info, warn, error, debug};

// Structured logging with context
info!(project_id = %id, "Project created successfully");
warn!(attempt = %attempt_id, "Retrying failed operation");
error!(error = ?e, "Failed to connect to database");
debug!(payload = ?request, "Received API request");

// Environment: RUST_LOG=info (default), RUST_LOG=debug for verbose
```

### Frontend (TypeScript)
```typescript
// Use console methods with context
console.error('Failed to create project:', error);
console.warn('Retrying operation', { attempt, maxRetries });

// In catch blocks, always log before user feedback
try {
  await projectsApi.create(data);
} catch (error) {
  console.error('Failed to create project:', error);
  setError('Failed to create project');
}
```

## 6. Testing

### Backend Tests
```bash
cargo test --workspace               # All tests
cargo test -p services              # Specific crate
cargo test test_git_operation       # Specific test
```

```rust
// Integration tests in crates/*/tests/
use tempfile::TempDir;

#[test]
fn test_git_operation() {
    let root = TempDir::new().unwrap();
    // Setup test environment
    // Assertions
}

// Unit tests colocated in src/
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_helper_function() { ... }
}
```

### Database Test Utilities

For database tests, use the shared test pool utilities in `crates/db/src/test_utils.rs`:

```rust
use db::test_utils::create_test_pool;

#[tokio::test]
async fn test_db_operation() {
    let (pool, _temp_dir) = create_test_pool().await;
    // The pool has migrations already applied via template database
    // Much faster than running migrations per test
}
```

**Benefits:**
- Template database approach: migrations run once, then copied for each test
- ~90% faster than running migrations per test
- Full test isolation (each test gets its own database copy)

### Frontend Validation
```bash
cd frontend
npm run lint                  # ESLint
npm run format:check         # Prettier
npx tsc --noEmit            # TypeScript type checking
```

## 7. API Contracts

### Response Wrapper
All endpoints return `ApiResponse<T>`:
```rust
// Backend
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
}

// Usage in handlers
Ok(ResponseJson(ApiResponse::success(project)))
```

```typescript
// Frontend unwrapping
const result: ApiResponse<Project> = await response.json();
if (!response.ok || !result.success) {
  throw new Error(result.message || 'Failed to fetch');
}
return result.data!;
```

### Type Synchronization
```rust
// Rust model (source of truth)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}
```

```typescript
// Auto-generated in shared/types.ts (DO NOT EDIT)
export type Project = {
  id: string;
  name: string;
  created_at: Date;
};
```

After modifying Rust types: `npm run generate-types`

## 8. Common Patterns

### Backend: Route Handler
```rust
pub async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    // Validate input
    if payload.name.is_empty() {
        return Err(ApiError::BadRequest("Name is required".into()));
    }

    // Business logic via services
    let project = ProjectService::create(&deployment.db().pool, payload).await?;

    // Return wrapped response
    Ok(ResponseJson(ApiResponse::success(project)))
}
```

### Backend: Database Model
```rust
impl Project {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Self,
            r#"SELECT id as "id: Uuid", name, created_at as "created_at: DateTime<Utc>"
               FROM projects WHERE id = ?"#,
            id
        )
        .fetch_optional(pool)
        .await
    }
}
```

### Frontend: API Client
```typescript
// lib/api.ts - Namespace pattern
export const projectsApi = {
  async list(): Promise<Project[]> {
    const response = await fetch('/api/projects');
    const result: ApiResponse<Project[]> = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch projects');
    }
    return result.data || [];
  },

  async create(data: CreateProject): Promise<Project> {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result: ApiResponse<Project> = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to create project');
    }
    return result.data!;
  },
};
```

### Frontend: Custom Hook with Mutations
```typescript
export function useProjectMutations(options?: UseProjectMutationsOptions) {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationKey: ['createProject'],
    mutationFn: (data: CreateProject) => projectsApi.create(data),
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      options?.onCreateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to create project:', err);
      options?.onCreateError?.(err);
    },
  });

  return { createProject };
}
```

### Frontend: Component Structure
```typescript
type Props = {
  project: Project;
  onEdit: (project: Project) => void;
};

function ProjectCard({ project, onEdit }: Props) {
  const navigate = useNavigateWithSearch();
  const { deleteProject } = useProjectMutations({
    onDeleteSuccess: () => navigate('/'),
  });

  const handleDelete = async () => {
    if (!confirm('Are you sure?')) return;
    deleteProject.mutate(project.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={() => onEdit(project)}>Edit</Button>
        <Button variant="destructive" onClick={handleDelete}>Delete</Button>
      </CardContent>
    </Card>
  );
}

export default ProjectCard;
```

### Backend: Route Handler Directory Module
For complex route domains with many handlers, use a directory module structure:

```text
routes/task_attempts/
├── mod.rs           # Router and submodule declarations
├── types.rs         # Request/response types for handlers
└── handlers/
    ├── mod.rs       # Re-exports all handlers
    ├── core.rs      # CRUD and basic operations
    ├── git_ops.rs   # Git-related operations
    ├── github.rs    # GitHub integration
    └── worktree.rs  # Worktree file operations
```

```rust
// handlers/mod.rs - Organize by concern and re-export
pub mod core;
pub mod git_ops;
pub mod github;
pub mod worktree;

// Re-export all handlers for convenient access from the router
pub use core::{create_task_attempt, get_task_attempt, stop_task_attempt};
pub use git_ops::{merge_task_attempt, rebase_task_attempt, push_task_attempt_branch};
pub use github::{create_github_pr, attach_existing_pr};
pub use worktree::{list_worktree_files, read_worktree_file};
```

### Backend: Model Directory Module
For complex models with many queries, use a directory module structure:

```text
models/task/
├── mod.rs           # Struct definition, types, tests, submodule declarations
├── queries.rs       # CRUD operations (find_by_id, create, update, delete)
├── archive.rs       # Archiving operations
├── hierarchy.rs     # Parent/child relationships
└── sync.rs          # Hive synchronization queries
```

```rust
// mod.rs - Struct definition with submodule declarations
mod archive;
mod hierarchy;
mod queries;
mod sync;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    // ...
}

// Re-export commonly used items
pub use archive::{archive, unarchive};
pub use queries::{find_by_id, create, update, delete};
```

### Backend: LogNormalizer Trait
For processing executor logs, implement the `LogNormalizer` trait:

```rust
use crate::logs::{LogNormalizer, normalize_logs_with};

pub struct MyExecutorNormalizer {
    // Executor-specific state
}

impl LogNormalizer for MyExecutorNormalizer {
    type Event = MyEventType;

    fn parse_line(&self, line: &str) -> Option<Self::Event> {
        // Parse executor-specific log format
    }

    fn extract_session_id(&self, event: &Self::Event) -> Option<String> {
        // Extract session ID from event
    }

    fn process_event(
        &mut self,
        event: Self::Event,
        msg_store: &Arc<MsgStore>,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        // Process event and return conversation patches
    }
}

// Usage in executor
let normalizer = MyExecutorNormalizer::new();
let handle = normalize_logs_with(normalizer, msg_store.clone(), &worktree_path);
```

## 9. Development Commands

### Setup
```bash
pnpm install                          # Install all dependencies
./init.sh                             # Full setup: prerequisites, .env, database, dependencies
./init.sh start                       # Start servers after setup
```

**Note on init.sh (January 2026)**: The init.sh script has been significantly enhanced to support isolated development in worktrees. Key improvements include:
- **Respect existing .env values**: Loads FRONTEND_PORT, BACKEND_PORT, and MCP_PORT from .env if present before auto-assigning ports
- **Database isolation**: Copies from ~/.vkswarm/db/test.sqlite or production database to local dev_assets/db.sqlite for worktree-local development
- **Port conflict detection**: Validates port availability before starting servers and provides clear error messages
- **Integrated stop command**: Uses pnpm run stop for graceful shutdown (see "Stopping the Server" section)
- **Status checking**: ./init.sh status shows running instances and port usage

This approach prevents worktree conflicts when multiple developers or AI agents work on different tasks simultaneously, each with isolated databases and ports.

### Development
```bash
pnpm run dev                          # Start frontend + backend (hot reload)
npm run frontend:dev                  # Frontend only (port 3000)
npm run backend:dev                   # Backend only (auto-assigned port)
HOST=0.0.0.0 pnpm run dev            # Network-accessible dev server
```

### Stopping the Server
```bash
pnpm run stop                         # Stop instance for current directory
pnpm run stop /path/to/project        # Stop a specific project's instance
pnpm run stop --all                   # Stop all running instances
pnpm run stop --list                  # List all running instances
```

**Graceful Shutdown Sequence**: The stop command ensures safe termination in dev mode:
1. **SIGTERM → backend** - Triggers graceful shutdown of the Rust process
2. **Wait for backend exit** (max 10s) - Backend performs critical cleanup:
   - Flushes all log buffers (executor logs)
   - Runs `PRAGMA wal_checkpoint(TRUNCATE)` (SQLite durability)
   - Closes database connection pool
3. **SIGTERM → dev_root_pid** - Kills concurrently, terminating cargo-watch and Vite
4. **Port-based fallback** - Uses `lsof` to clean up any orphaned processes

**Critical**: The backend's cleanup sequence MUST complete before dev processes are killed. This ensures database integrity and prevents log loss.

**Multi-instance support**: Multiple vibe-kanban instances can run simultaneously. Each instance registers in `/tmp/vibe-kanban/instances/` with project root, PID, dev_root_pid (dev mode), and all ports.

**Process hierarchy in dev mode**:
```text
start-dev.js
  └─ concurrently (dev_root_pid)
      ├─ cargo watch
      │   └─ vks-node-server (backend PID)
      └─ npm/vite (frontend)
```

**Troubleshooting**: If you encounter "port already in use" errors after stopping:
- Run `pnpm run stop --all` to clean up all instances
- Check for orphaned processes: `lsof -i :PORT`
- Manually kill if needed: `kill -9 <PID>`

### Production
```bash
pnpm run prod                         # Full build + run production
pnpm run prod:build                   # Build frontend + release binary
pnpm run prod:run                     # Run production binary (after build)
pnpm run prod:backend                 # Backend only (release mode, no frontend build)
```

### Validation
```bash
npm run check                         # All checks (frontend + backend)

# Frontend
cd frontend && npm run lint           # ESLint
cd frontend && npm run format:check   # Prettier
cd frontend && npx tsc --noEmit      # TypeScript

# Backend
cargo fmt --all -- --check           # Rust formatting
cargo clippy --all --all-targets --all-features -- -D warnings  # Clippy
cargo test --workspace               # All tests
```

### Type Generation
```bash
npm run generate-types               # Regenerate TypeScript from Rust
npm run generate-types:check        # Verify types are current
```

### Database

**Location:**
- **Development**: `<project_root>/dev_assets/db.sqlite`
- **Production**: Platform-specific data directory (e.g., `~/.local/share/vibe-kanban/db.sqlite`)

**Automatic Backups:**
- Pre-migration backups are created automatically on server startup
- Backups stored in `dev_assets/backups/` (dev) or alongside the database (prod)
- Last 5 backups retained; older ones are automatically deleted
- Backup format: `db_backup_YYYYMMDD_HHMMSS.sqlite`

**Commands:**
```bash
sqlx migrate run                     # Apply migrations
sqlx database create                 # Create database
# Note: Dev database auto-copied from dev_assets_seed/ on startup
```

**Recovery from Backup:**
```bash
# Stop the server first, then restore
cp dev_assets/backups/db_backup_YYYYMMDD_HHMMSS.sqlite dev_assets/db.sqlite
```

### Build
```bash
./build-npm-package.sh              # Production build
```

### Environment Variables

See `.env.example` for complete documentation. Key variables:

Network:
- `HOST`: Backend host (default: `127.0.0.1`, use `0.0.0.0` for network access)
- `BACKEND_PORT`: Backend server port (default: auto-assign)
- `FRONTEND_PORT`: Frontend dev port (default: `3000`)
- `MCP_PORT`: HTTP MCP server port. If set, spawns MCP at `http://{HOST}:{MCP_PORT}/mcp`

Storage (see `docs/configuration-customisation/storage-configuration.mdx`):
- `VK_DATABASE_PATH`: Override database file location (supports tilde expansion)
- `VK_BACKUP_DIR`: Override backup directory (default: `{data_dir}/backups`)
- `VK_WORKTREE_DIR`: Override worktree directory (default: `/var/tmp/vibe-kanban/worktrees`)

Database Performance:
- `VK_SQLITE_MAX_CONNECTIONS`: Connection pool size (default: `10`)
- `VK_SLOW_QUERY_MS`: Slow query threshold in ms (default: `100`)

Scheduled Backups:
- `VK_SCHEDULED_BACKUPS`: Enable auto backups (default: `true`)
- `VK_BACKUP_INTERVAL_HOURS`: Backup interval (default: `4`)
- `VK_BACKUP_RETENTION`: Backups to keep - single value or `pre-migration,scheduled` (default: `5,10`)

WAL Monitoring:
- `VK_WAL_CHECK_INTERVAL_SECS`: Check interval (default: `60`)
- `VK_WAL_WARNING_THRESHOLD_MB`: Warning threshold (default: `50`)
- `VK_WAL_CHECKPOINT_THRESHOLD_MB`: Auto checkpoint threshold (default: `100`)
- `VK_WAL_AUTO_CHECKPOINT`: Enable auto checkpoints (default: `true`)
- `VK_WAL_TRUNCATE_INTERVAL_SECS`: TRUNCATE checkpoint interval for durability (default: `300`)

Logging:
- `RUST_LOG`: Log level - trace, debug, info, warn, error (default: `info`)
- `VK_FILE_LOGGING`: Enable file-based logging (default: `false`)
- `VK_LOG_DIR`: Override log directory (default: `{data_dir}/logs`)
- `VK_LOG_MAX_FILES`: Max daily log files to retain (default: `7`)

Worktree Cleanup:
- `DISABLE_WORKTREE_ORPHAN_CLEANUP`: Disable orphan cleanup (default: `0`)
- `DISABLE_WORKTREE_EXPIRED_CLEANUP`: Disable expired (72h+) cleanup (default: `0`)

Swarm/Hive Node (see `docs/swarm-hive-setup.mdx`):
- `VK_HIVE_URL`: WebSocket URL of hive server (e.g., `wss://hive.example.com`)
- `VK_NODE_API_KEY`: API key for authenticating with the hive
- `VK_NODE_NAME`: Human-readable node name (defaults to hostname)
- `VK_NODE_PUBLIC_URL`: Public URL for direct log streaming
- `VK_CONNECTION_TOKEN_SECRET`: JWT secret for direct connection tokens

## 10. AI Coding Assistant Instructions

1. **Read before writing**: Always read existing files before modifying. Understand the patterns in place.

2. **Run checks before committing**: Execute `npm run check` to catch type errors and lint issues.

3. **Generate types after Rust changes**: Run `npm run generate-types` after modifying any Rust struct with `#[derive(TS)]`.

4. **Follow the error pattern**: Use `thiserror` with `#[from]` for Rust errors. Map to HTTP status codes in `error.rs`.

5. **Use existing hooks**: Check `frontend/src/hooks/` before creating new data-fetching logic. Likely a hook exists.

6. **Match API patterns**: Backend routes return `Result<ResponseJson<ApiResponse<T>>, ApiError>`. Frontend unwraps via `api.ts`.

7. **Respect naming conventions**: Rust enums serialize as `snake_case`. TypeScript components are PascalCase. Hooks use `use` prefix.

8. **Keep services stateless**: Service structs should be `Clone` with no fields. Pass `&SqlitePool` to methods.

9. **Test database operations**: Use `db::test_utils::create_test_pool()` for fast, isolated test databases. Falls back to `tempfile::TempDir` for non-DB tests.

10. **Check existing components**: Look at similar components in `frontend/src/components/` before creating new ones. Follow established patterns for Props, hooks, and error handling.

11. **CRITICAL - Safe Process Management**: When running in a worktree spawned by vibe-kanban, NEVER use `pkill`, `killall`, or pattern-based process killing. These commands can accidentally kill the parent vibe-kanban server, causing database corruption. Instead:
    - To stop the vibe-kanban dev server: `pnpm run stop` (stops instance for current directory)
    - To list all running instances: `pnpm run stop --list`
    - To stop all instances: `pnpm run stop --all`
    - To kill a specific process: Use `kill <PID>` with the exact PID
    - The server binary is named `vks-node-server`, not "server"
    - Instance registry is at `/tmp/vibe-kanban/instances/` (JSON files keyed by project path hash)
    - Each instance file contains: project_root, PID, ports (backend, frontend, mcp, hive)
