# CLAUDE.md - Vibe Kanban Development Guide

## 1. Core Principles

- **Type Safety First**: All data structures must be typed. Use Rust's type system and TypeScript strict mode.
- **Single Source of Truth**: Rust types are authoritative. Run `npm run generate-types` after modifying Rust structs.
- **Error Transparency**: Use `thiserror` with `#[from]` for error propagation. Never swallow errors silently.
- **Stateless Services**: Service structs should be stateless and `Clone`. Pass dependencies via function parameters.
- **UUID Identifiers**: All entities use UUID v4 for primary keys.
- **UTC Timestamps**: All timestamps stored as `DateTime<Utc>` (Rust) and ISO 8601 strings (JSON/SQLite).

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
├── routes/       # HTTP handlers (one file per domain)
├── mcp/          # Model Context Protocol server
├── middleware/   # Auth, request handling
└── error.rs      # Global API error types

db/               # Database layer
├── models/       # SQLx models with queries
└── migrations/   # SQL migration files

services/         # Business logic (stateless)
├── git.rs        # Git operations
├── github.rs     # GitHub API integration
└── worktree.rs   # Worktree management

executors/        # AI agent integrations
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

## 9. Development Commands

### Setup
```bash
pnpm install                          # Install all dependencies
```

### Development
```bash
pnpm run dev                          # Start frontend + backend (hot reload)
npm run frontend:dev                  # Frontend only (port 3000)
npm run backend:dev                   # Backend only (auto-assigned port)
HOST=0.0.0.0 pnpm run dev            # Network-accessible dev server
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
```bash
sqlx migrate run                     # Apply migrations
sqlx database create                 # Create database
# Note: Dev database auto-copied from dev_assets_seed/ on startup
```

### Build
```bash
./build-npm-package.sh              # Production build
```

## 10. AI Coding Assistant Instructions

1. **Read before writing**: Always read existing files before modifying. Understand the patterns in place.

2. **Run checks before committing**: Execute `npm run check` to catch type errors and lint issues.

3. **Generate types after Rust changes**: Run `npm run generate-types` after modifying any Rust struct with `#[derive(TS)]`.

4. **Follow the error pattern**: Use `thiserror` with `#[from]` for Rust errors. Map to HTTP status codes in `error.rs`.

5. **Use existing hooks**: Check `frontend/src/hooks/` before creating new data-fetching logic. Likely a hook exists.

6. **Match API patterns**: Backend routes return `Result<ResponseJson<ApiResponse<T>>, ApiError>`. Frontend unwraps via `api.ts`.

7. **Respect naming conventions**: Rust enums serialize as `snake_case`. TypeScript components are PascalCase. Hooks use `use` prefix.

8. **Keep services stateless**: Service structs should be `Clone` with no fields. Pass `&SqlitePool` to methods.

9. **Test database operations**: Use `tempfile::TempDir` for isolated test environments. Clean up after tests.

10. **Check existing components**: Look at similar components in `frontend/src/components/` before creating new ones. Follow established patterns for Props, hooks, and error handling.
