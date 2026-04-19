# Vibe Kanban Local-First: Cloud Removal Design

**Date:** 2026-04-19  
**Status:** Draft  
**Author:** AI Assistant + User

## Overview

Transform Vibe Kanban from a cloud-optional app into a purely local-first, single-user productivity tool. Remove all Vibe Kanban Cloud dependencies while retaining the P2P remote access feature for accessing your instance from other machines.

## Goals

- **Zero cloud dependency** — runs entirely on your machine, no external services required
- **No login required** — open the app and start working immediately
- **Your data stays yours** — SQLite database stored locally, never leaves your machine
- **P2P remote access** — securely connect to your instance from anywhere via pairing codes or SSH keys

## Non-Goals

- Multi-user collaboration (removed)
- Team/organization features (removed)
- Cloud sync (removed)
- OAuth login (removed)

## Feature Set

### Retained Features

- Kanban boards with drag-and-drop columns and cards
- Projects containing multiple issues/tasks
- Issues with descriptions, tags, relationships, comments, attachments
- Workspaces for isolated coding environments
- AI coding agents (Claude, Codex, GPT, etc.)
- Git integration: branches, commits, PR creation and review
- File browser with editor integration (VS Code, Cursor, etc.)
- P2P remote access with pairing code / SSH key authentication

### Removed Features

- Organizations and team management
- OAuth login (GitHub/Google)
- Cloud relay tunnel
- Remote project sync
- Billing and subscriptions
- Email notifications
- ElectricSQL real-time sync

## Architecture Changes

### Files to Delete

#### Backend (Rust)

| Path | Description |
|------|-------------|
| `crates/remote/` | Entire 101-file cloud backend (PostgreSQL, ElectricSQL, OAuth, orgs, billing) |
| `crates/relay-hosts/` | Cloud relay client |
| `crates/server/src/routes/remote/` | 8 files proxying to cloud (issues, projects, tags, etc.) |
| `crates/server/src/routes/organizations.rs` | Org management |
| `crates/server/src/routes/oauth.rs` | OAuth flows |
| `crates/server/src/runtime/relay_registration.rs` | Cloud relay registration |
| `crates/services/src/services/remote_client.rs` | Cloud API client |
| `crates/services/src/services/remote_sync.rs` | Cloud sync logic |

#### Frontend (TypeScript)

| Path | Description |
|------|-------------|
| `packages/remote-web/` | Entire cloud web app |
| `packages/web-core/src/shared/lib/remoteApi.ts` | Cloud API calls |
| `packages/web-core/src/shared/lib/relay*.ts` | 5+ relay-related files |
| `packages/web-core/src/shared/hooks/useRemoteCloudHosts.ts` | Cloud hosts hook |
| `packages/web-core/src/shared/dialogs/settings/*/Remote*.tsx` | Cloud settings UI |
| Auth token management, OAuth dialogs | Various files |

### Files to Keep

| Path | Description |
|------|-------------|
| `crates/server/` | Local API server (stripped of cloud routes) |
| `crates/db/` | SQLite models and migrations |
| `crates/services/` | Local services (file, git, AI execution) |
| `crates/ssh-tunnel/` | P2P SSH tunneling |
| `crates/server/src/routes/p2p_hosts.rs` | P2P pairing routes |
| `packages/local-web/` | Main web app (cleaned up) |
| `packages/web-core/` | Shared components (cleaned up) |

### Key Code Changes

#### Backend

**`crates/server/src/routes/mod.rs`** — Remove cloud route registrations:
- Delete `.merge(remote::issues::router())`
- Delete `.merge(remote::projects::router())`
- Delete `.merge(organizations::router())`
- Delete `.merge(oauth::router())`
- Keep P2P routes in `relay_auth::client` (for P2P pairing only)

**`crates/local-deployment/src/lib.rs`** — Remove `remote_client()` method and `VK_SHARED_API_BASE` handling.

**`crates/services/src/lib.rs`** — Remove `RemoteClient` from service registry.

**`Cargo.toml` (workspace)** — Remove `remote`, `relay-hosts` from workspace members.

#### Frontend

**`packages/web-core/src/shared/lib/api.ts`** — Remove `relayApi`, simplify `makeRequest`.

**`packages/local-web/src/app/entry/Bootstrap.tsx`** — Remove `configureAuthRuntime()`, `tokenManager` setup.

**Settings UI** — Remove tabs: "Remote Hosts (Cloud)", "Organizations", "Account". Keep: "Remote Hosts (P2P)", "Appearance", "AI Agents", "Git".

## Safety Strategy

### Phase 1: Audit Before Deleting

- For each file marked for deletion, trace all imports/usages
- Identify local features that depend on it
- Create a "needs refactoring" list before removing anything

### Phase 2: Decouple First, Delete Second

- Extract any local logic trapped inside cloud-dependent code
- Replace cloud API calls with no-ops or local equivalents
- Remove conditional checks that gate local features behind cloud auth

### Phase 3: Incremental Removal with Tests

- Delete one module at a time
- Run `cargo check` and `pnpm run check` after each deletion
- Verify core flows still work:
  - Create project → Add issues → Drag on kanban
  - Create workspace → Run AI agent → See code changes
  - Connect via P2P from another machine

### Phase 4: Clean Up Dead Code

- Remove unused imports, types, and config options
- Simplify settings UI
- Update documentation

## Error Handling & Edge Cases

### Startup Without Cloud

- Remove all `VK_SHARED_API_BASE not set` log messages
- Remove `remote_auth_degraded` state and sync error banners
- App starts cleanly with zero warnings

### P2P Connection Failures

- Show clear error: "Could not connect to [host]. Check if it's online and reachable."
- Offer retry button
- No cloud relay fallback

### Data That Referenced Cloud

- Migration script to clean orphaned references (org IDs, remote project IDs)
- Graceful handling: if a `remote_project_id` exists, treat as local-only

### Features That Silently Depended on Cloud

- **PR creation** — Use direct GitHub API, not cloud proxy
- **Issue linking** — Local issues only
- **Attachments** — Local storage only
- **User identity** — Use `machine_id` as sole identifier

### Config Migration

- Ignore `VK_SHARED_API_BASE`, `VK_SHARED_RELAY_API_BASE` if present
- Log info message about ignored cloud config

## Implementation Plan

### Phase 1: Preparation (Low Risk)

1. Create git branch `local-first-cleanup`
2. Document all cloud-dependent files with their local dependencies
3. Add integration test: "create project → add issue → drag on kanban → verify"
4. Add integration test: "P2P connect → list projects → verify data"

### Phase 2: Backend Cleanup

1. Remove `crates/remote/` from workspace (exclude, don't delete yet)
2. Remove `crates/relay-hosts/` from workspace
3. Delete cloud route files in `crates/server/src/routes/remote/`
4. Delete `oauth.rs`, `organizations.rs`, `relay_registration.rs`
5. Clean up `crates/services/` — remove `remote_client.rs`, `remote_sync.rs`
6. Update `Deployment` trait — remove `remote_client()` method
7. Run `cargo check --workspace` — fix compilation errors
8. Run `cargo test --workspace` — ensure tests pass

### Phase 3: Frontend Cleanup

1. Delete `packages/remote-web/` entirely
2. Remove `remoteApi.ts`, `relay*.ts` files
3. Remove cloud-related hooks and components
4. Simplify `Bootstrap.tsx` — remove auth runtime setup
5. Clean up Settings dialog — remove cloud tabs
6. Run `pnpm run check` and `pnpm run lint` — fix errors

### Phase 4: Final Cleanup & Testing

1. Delete excluded crates from disk
2. Update documentation — remove cloud setup guides
3. Manual testing of all core flows
4. Update README for local-first positioning

## Estimated Scope

- **~150 files deleted**
- **~50 files modified**
- **~15,000 lines of code removed** (estimate)

## Success Criteria

1. App starts without any cloud-related warnings or errors
2. All local features work: kanban, projects, issues, workspaces, AI agents, git
3. P2P remote access works with pairing codes and SSH keys
4. `cargo build --release` produces a single binary with no cloud dependencies
5. No references to cloud APIs, OAuth, organizations, or relay remain in codebase
