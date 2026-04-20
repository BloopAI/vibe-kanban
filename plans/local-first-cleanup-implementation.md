# Local-First Cleanup Implementation Plan

**Branch:** `local-first-cleanup`  
**Worktree:** `.worktrees/local-first-cleanup`  
**Design Doc:** `docs/plans/2026-04-19-local-first-cloud-removal-design.md`

## Phase 1: Backend Cleanup

### Task 1.1: Remove crates/remote from workspace
- [ ] Edit `Cargo.toml` (workspace root) — remove `remote` from `members`
- [ ] Run `cargo check --workspace` — verify it compiles without remote
- [ ] Commit: "chore: exclude crates/remote from workspace"

### Task 1.2: Remove crates/relay-hosts from workspace  
- [ ] Edit `Cargo.toml` (workspace root) — remove `relay-hosts` from `members`
- [ ] Edit any crates that depend on `relay-hosts` — remove the dependency
- [ ] Run `cargo check --workspace`
- [ ] Commit: "chore: exclude crates/relay-hosts from workspace"

### Task 1.3: Remove cloud routes from server
- [ ] Delete `crates/server/src/routes/remote/` directory (8 files)
- [ ] Delete `crates/server/src/routes/organizations.rs`
- [ ] Delete `crates/server/src/routes/oauth.rs`
- [ ] Edit `crates/server/src/routes/mod.rs` — remove route registrations
- [ ] Run `cargo check -p server`
- [ ] Commit: "refactor(server): remove cloud proxy routes"

### Task 1.4: Remove relay registration runtime
- [ ] Delete `crates/server/src/runtime/relay_registration.rs`
- [ ] Edit `crates/server/src/runtime/mod.rs` — remove module
- [ ] Edit any code that starts relay registration
- [ ] Run `cargo check -p server`
- [ ] Commit: "refactor(server): remove relay registration runtime"

### Task 1.5: Clean up services crate
- [ ] Delete `crates/services/src/services/remote_client.rs`
- [ ] Delete `crates/services/src/services/remote_sync.rs`
- [ ] Edit `crates/services/src/services/mod.rs` — remove modules
- [ ] Edit `crates/services/src/lib.rs` — remove RemoteClient from exports
- [ ] Run `cargo check -p services`
- [ ] Commit: "refactor(services): remove cloud client and sync"

### Task 1.6: Clean up local-deployment crate
- [ ] Edit `crates/local-deployment/src/lib.rs` — remove `remote_client()` method
- [ ] Remove `VK_SHARED_API_BASE` handling
- [ ] Edit `crates/local-deployment/src/container.rs` — remove cloud references
- [ ] Run `cargo check -p local-deployment`
- [ ] Commit: "refactor(local-deployment): remove cloud client support"

### Task 1.7: Clean up relay-auth routes (keep P2P only)
- [ ] Review `crates/server/src/routes/relay_auth/` — identify what's P2P vs cloud
- [ ] Remove cloud-specific relay auth code
- [ ] Keep P2P pairing routes (`p2p_hosts.rs`)
- [ ] Run `cargo check -p server`
- [ ] Commit: "refactor(server): keep only P2P routes in relay_auth"

### Task 1.8: Final backend verification
- [ ] Run `cargo check --workspace`
- [ ] Run `cargo test --workspace`
- [ ] Run `cargo build --release -p server`
- [ ] Commit any fixes needed

## Phase 2: Frontend Cleanup

### Task 2.1: Delete remote-web package
- [ ] Delete `packages/remote-web/` directory entirely
- [ ] Edit root `package.json` — remove remote-web scripts if any
- [ ] Edit `pnpm-workspace.yaml` — remove remote-web if listed
- [ ] Run `pnpm install`
- [ ] Commit: "chore: delete packages/remote-web"

### Task 2.2: Remove remoteApi.ts
- [ ] Delete `packages/web-core/src/shared/lib/remoteApi.ts`
- [ ] Find and update all imports of `remoteApi`
- [ ] Run `pnpm run local-web:check`
- [ ] Commit: "refactor(web-core): remove remoteApi"

### Task 2.3: Remove relay-related frontend code
- [ ] Delete `packages/web-core/src/shared/lib/relay*.ts` (5+ files)
- [ ] Delete `packages/web-core/src/shared/lib/relayPairingStorage.ts`
- [ ] Delete `packages/web-core/src/shared/lib/relayBackendApi.ts`
- [ ] Delete `packages/web-core/src/shared/lib/relayClientIdentity.ts`
- [ ] Delete `packages/web-core/src/shared/lib/relaySigningSessionRefresh.ts`
- [ ] Delete `packages/web-core/src/shared/lib/relayPake.ts`
- [ ] Update imports in dependent files
- [ ] Run `pnpm run local-web:check`
- [ ] Commit: "refactor(web-core): remove relay frontend code"

### Task 2.4: Remove cloud hooks and components
- [ ] Delete `packages/web-core/src/shared/hooks/useRemoteCloudHosts.ts`
- [ ] Delete/update `packages/web-core/src/shared/dialogs/settings/settings/RemoteCloudHostsSettingsCard.tsx`
- [ ] Delete/update `packages/web-core/src/shared/dialogs/settings/settings/RemoteProjectsSettingsSection.tsx`
- [ ] Delete/update `packages/web-core/src/shared/dialogs/settings/settings/RelaySettingsSection.tsx`
- [ ] Delete `packages/web-core/src/shared/components/CloudShutdownExportBanner.tsx`
- [ ] Update `settingsRegistry.tsx` — remove cloud settings tabs
- [ ] Run `pnpm run local-web:check`
- [ ] Commit: "refactor(web-core): remove cloud hooks and components"

### Task 2.5: Simplify Bootstrap.tsx
- [ ] Edit `packages/local-web/src/app/entry/Bootstrap.tsx`
- [ ] Remove `configureAuthRuntime()` setup
- [ ] Remove `tokenManager` imports and usage
- [ ] Remove OAuth-related imports
- [ ] Run `pnpm run local-web:check`
- [ ] Commit: "refactor(local-web): simplify bootstrap, remove auth setup"

### Task 2.6: Clean up api.ts
- [ ] Edit `packages/web-core/src/shared/lib/api.ts`
- [ ] Remove `relayApi` exports
- [ ] Simplify `makeRequest` — remove host-aware routing for cloud
- [ ] Keep local API functions and P2P host-aware routing
- [ ] Run `pnpm run local-web:check`
- [ ] Commit: "refactor(web-core): simplify api.ts, remove cloud APIs"

### Task 2.7: Final frontend verification
- [ ] Run `pnpm run local-web:check`
- [ ] Run `pnpm run lint`
- [ ] Run `pnpm run local-web:build`
- [ ] Commit any fixes needed

## Phase 3: Final Cleanup

### Task 3.1: Delete excluded crates from disk
- [ ] `rm -rf crates/remote`
- [ ] `rm -rf crates/relay-hosts`
- [ ] Commit: "chore: delete cloud crates from disk"

### Task 3.2: Update documentation
- [ ] Edit `README.md` — update for local-first positioning
- [ ] Delete `docs/self-hosting/local-development.mdx` (cloud setup guide)
- [ ] Update `CLAUDE.md` / `AGENTS.md` — remove cloud references
- [ ] Commit: "docs: update for local-first app"

### Task 3.3: Clean up configuration
- [ ] Edit `.env.example` if it exists — remove cloud vars
- [ ] Edit `package.json` — remove cloud-related scripts
- [ ] Commit: "chore: clean up configuration files"

### Task 3.4: Full integration test
- [ ] Start backend: `pnpm run backend:dev:watch`
- [ ] Start frontend: `pnpm run local-web:dev`
- [ ] Test: Create project, add issues, drag on kanban
- [ ] Test: Create workspace, verify AI agent works
- [ ] Test: P2P pairing (if second machine available)
- [ ] Document any issues found

## Verification Checklist

After all phases complete:

- [ ] `cargo check --workspace` passes
- [ ] `cargo test --workspace` passes
- [ ] `cargo build --release -p server` produces binary
- [ ] `pnpm run local-web:check` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run local-web:build` produces bundle
- [ ] App starts without cloud-related warnings
- [ ] Kanban board works (create, drag, edit)
- [ ] Workspaces work (create, run agent)
- [ ] P2P remote access works (pairing, connection)
- [ ] No cloud references in codebase: `rg "VK_SHARED_API_BASE|remote_client|RemoteClient" --type rust --type ts`
