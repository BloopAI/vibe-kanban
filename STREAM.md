# STREAM.md

## Stream Identifier

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Base: `fork/staging`
- Working mode: production hotfix promotion for local VK stability

## Objective

- Repair local Codex rollout continuity, execution-status streaming, and local issue/workspace linking so failed rollouts, stale "agent running" UI state, and newly created workspaces without Issues do not block normal prompt flow, then promote the fixes through the fork workflow so they survive updates/deploys.

## In Scope

- Truthful branch-local continuity for this worktree
- Guarding resume/fork selection against failed coding-agent turns
- Repairing live local DB continuity pointers that reference empty or missing rollout files
- Keeping execution-process state streams alive/reconnected so completed agents stop showing as running without a page refresh
- Keeping `vibe.local` reachable through the LAN reverse proxy
- Keeping local-only auth gates open when `shared_api_base` is intentionally unset
- Preserving the local-only runtime baseline and staging merge compatibility
- Preserving the frontend-generated local issue UUID when the local fallback issue endpoint creates a task, so workspace creation can link the new workspace back to its Issue

## Out of Scope

- Reconstructing the old backup-retention branch context as if it were still checked out here
- Re-enabling shared/cloud API behavior
- Reconstructing a zero-byte Codex rollout file that has no persisted content
- Broad workspace lifecycle cleanup beyond what already exists on `fork/staging`

## Stream-Specific Decisions

- Local runtime expectations from `STATE.md` remain in force, including `shared_api_base: null`.
- Resume continuity should only anchor to successful coding-agent turns: completed process, exit code `0`, non-null agent session id, and non-empty final summary.
- Empty or missing rollout files are live-state corruption, not valid resume anchors.
- Execution-process streams are long-lived state streams; non-patch terminal messages must not make mounted workspace views keep stale running snapshots.
- `vibe.local` requires the user service to bind `HOST=0.0.0.0` on `BACKEND_PORT=4311` for the external LAN nginx proxy.
- Local-only installs with no shared API base must report `LoggedIn { profile: None }` so the UI does not show remote sign-in prompts.
- If Codex rejects a stored rollout during `thread/fork`, start a fresh thread instead of failing the user prompt; stale rollout pointers are an optimization, not a hard dependency.
- Local fallback issue creation must honor a caller-supplied issue `id`; the workspace draft stores that id before workspace creation, so replacing it server-side creates orphaned workspaces with `task_id = null`.

## Relevant Files / Modules

- `STREAM.md`
- `HANDOFF.md`
- `DELTA.md`
- `STATE.md`
- `crates/db/src/models/coding_agent_turn.rs`
- `crates/services/src/services/events/streams.rs`
- `crates/local-deployment/src/lib.rs`
- `crates/executors/src/executors/codex.rs`
- `crates/executors/src/executors/codex/review.rs`
- `crates/db/src/models/task.rs`
- `crates/server/src/routes/local_compat.rs`
- `packages/web-core/src/shared/hooks/useJsonPatchWsStream.ts`
- `packages/web-core/src/shared/hooks/useExecutionProcesses.ts`
- `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts`
- `/home/mcp/.local/share/vibe-kanban/db.v2.sqlite`
- `/home/mcp/.local/share/vibe-kanban/codex-home/sessions`
- `/home/mcp/.config/systemd/user/vibe-kanban.service.d/fixed-ports.conf`
- `/home/mcp/.config/systemd/user/vibe-kanban.service.d/local-auth.conf`

## Current Status

- Confirmed:
  - the reported zero-byte rollout was `019dc72a-9fba-7961-9c36-a3f8f8a63036`
  - the reported `019dc9bd-ef72-76f2-b08e-4c83659f0369` rollout is non-empty
  - the live DB repair cleared four invalid `agent_session_id` pointers whose rollout files were empty or missing
  - a DB backup was saved at `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`
  - the local service is rebuilt/restarted with the rollout guard and execution-process stream hotfix
  - `vibe.local` returns `200` through nginx after binding VK to `0.0.0.0:4311`
- Completed locally:
  - committed rollout continuity guard
  - committed execution-status stream and `vibe.local` hotfix
  - merged PR `#37` into `staging`
  - confirmed the live left-nav sign-in regression was caused by `/api/info` returning `login_status: loggedout` for a local-only install
  - added the live `VK_DISABLE_AUTH=1` systemd drop-in and verified `/api/info` returns `login_status: loggedin`
  - hardened source so local-only installs with no shared API base report `LoggedIn { profile: None }`
  - rebuilt and redeployed `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `8d348fb20f36bb25d0dc0737aa5ae3df6e8e8c2243003bff6ffc27f2985f6525`
  - verified `vibe.local` still returns `200` after restart
  - repaired live pointer `019dc44c-03d6-7401-a6f5-52353f438bcf` by backing up the DB to `/home/mcp/backups/vk-rollout-repair-20260426T-thread019dc44c/db.v2.sqlite` and clearing only that stale `agent_session_id`
  - added a Codex executor fallback so missing, empty, or unloadable stored rollouts start a fresh thread for both normal prompts and reviews
  - rebuilt and redeployed `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `4a87753855846cde85227e582c3fb0fc3fe23b297b5cd5fd74c65b802f81cc6b`
  - verified the service is active, `/api/info` is logged in with `shared_api_base: null`, and `vibe.local` returns `200`
  - traced new workspaces missing from Issues to the local fallback `/v1/issues` endpoint dropping the optimistic issue UUID generated by the frontend
  - repaired workspace `915ede80-a3ba-46fc-8665-ed8b368a0bac` by linking it to task `b6d2320a-f63c-463f-97ec-d41f4b7f9617` after backing up the DB to `/home/mcp/backups/vk-issue-workspace-link-repair-20260426T2208/db.v2.sqlite`
  - changed local issue creation to insert with the caller-provided UUID and return idempotently if the same issue already exists in the same project
  - rebuilt and redeployed `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `aa04de0df56aad09c6180200c332c5cfa56f30125e84462355cf2f8a76a2c733`
  - smoke-tested the live endpoint with temporary issue id `48344d12-121d-43cd-bb4f-5abde908d78c`; it appeared with that exact id, was deleted, and the DB count returned `0`
- In progress:
  - committing, pushing, and promoting the local issue id preservation hotfix into `staging`

## Risks / Regression Traps

- Trusting stale continuity docs instead of the checked-out branch and code
- Treating any non-null `agent_session_id` as resumable without checking the source process outcome
- Treating a DB-valid `agent_session_id` as forkable after Codex has already rejected the rollout
- Nulling all historical agent session IDs instead of only invalid live-state pointers
- Letting execution-process WebSocket streams treat clean closes or unrelated `finished` messages as terminal state for a mounted workspace
- Removing the fixed `HOST=0.0.0.0`, `BACKEND_PORT=4311`, and `PREVIEW_PROXY_PORT=4312` systemd drop-in will break `vibe.local`
- Removing the live `VK_DISABLE_AUTH=1` drop-in should not break local UI gates after the source hardening deploy, but keeping it is still harmless defense in depth.
- Ignoring frontend-provided issue ids in local fallback mode will orphan newly created workspaces again because the workspace create request links against the optimistic issue id.

## Next Safe Steps

1. Commit and push the local issue id preservation hotfix.
2. Open a new PR into `staging`.
3. Promote the hotfix into `staging` once checks pass or after explicit human approval to bypass known failing checks.
