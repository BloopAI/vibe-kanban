# HANDOFF.md

## What Changed This Session

- Investigated Codex rollout continuity failures from the live local Vibe Kanban install.
- Added a DB-level resume guard so failed or incomplete coding-agent turns are not selected as continuity anchors.
- Backed up the live DB and cleared only invalid `agent_session_id` pointers whose rollout files were empty or missing.
- Fixed `vibe.local` 502 by restoring the local service bind address for the LAN reverse proxy.
- Added execution-process stream reconnect/server filtering so mounted workspace pages do not stay stuck showing agents as running after the stream closes.
- Merged PR `#37` into `staging` for the rollout, execution-status, and `vibe.local` hotfixes.
- Investigated the recurring left-nav sign-in prompt and traced it to local-only `/api/info` returning `login_status: loggedout`.
- Added a live `VK_DISABLE_AUTH=1` systemd drop-in and hardened source so local-only installs with no shared API base report signed in without a profile.
- Investigated `no rollout found for thread id 019dc44c-03d6-7401-a6f5-52353f438bcf`; the rollout JSONL existed, but Codex rejected it as unforkable.
- Backed up the live DB to `/home/mcp/backups/vk-rollout-repair-20260426T-thread019dc44c/db.v2.sqlite` and cleared only that stale `agent_session_id` pointer.
- Added, deployed, and verified a Codex executor fallback so missing, empty, or unloadable stored rollout IDs start a fresh thread instead of failing prompts or reviews.
- Investigated new workspaces missing from Issues and traced it to local fallback issue creation dropping the frontend-generated issue UUID.
- Backed up the live DB to `/home/mcp/backups/vk-issue-workspace-link-repair-20260426T2208/db.v2.sqlite` and linked workspace `915ede80-a3ba-46fc-8665-ed8b368a0bac` to task `b6d2320a-f63c-463f-97ec-d41f4b7f9617`.
- Added, deployed, and verified local issue creation that preserves a caller-provided UUID so subsequent workspace creation can resolve the Issue link.

## What Is True Right Now

- The live local install remains the source of truth.
- The checked-out branch in this worktree is `vk/ea3c-vk-auto-archive`.
- PR `#37` targeted `staging` from this branch and is merged; the current branch is fast-forwarded to `fork/staging` and now carries the follow-up local-auth hardening.
- `crates/db/src/models/coding_agent_turn.rs` now only returns resumable session info from completed, exit-0 coding-agent turns with a non-empty summary.
- `crates/local-deployment/src/lib.rs` now treats local-only installs with no shared API base as `LoggedIn { profile: None }`.
- The reported empty rollout `019dc72a-9fba-7961-9c36-a3f8f8a63036` cannot be reconstructed because the persisted JSONL file is zero bytes.
- The reported rollout `019dc9bd-ef72-76f2-b08e-4c83659f0369` exists and is non-empty; its late `thread not found` log did not indicate an empty rollout.
- The live DB now has zero `agent_session_id` pointers to empty or missing rollout files.
- The live DB backup is `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`.
- The latest single-pointer DB backup is `/home/mcp/backups/vk-rollout-repair-20260426T-thread019dc44c/db.v2.sqlite`.
- The stale live DB pointer for `019dc44c-03d6-7401-a6f5-52353f438bcf` has been cleared.
- Codex normal prompt and review launch paths now fall back to a fresh thread when `thread/fork` reports `no rollout found for thread id`, `empty session file`, or `failed to load rollout`.
- The local fallback `/v1/issues` create endpoint now accepts an optional `id` and inserts the task with that exact UUID.
- If the same issue id already exists in the same project, local fallback issue creation returns success idempotently; if it exists in a different project, it rejects the request.
- The previously orphaned `FR::Modernize Design` workspace now appears through `project_workspaces` with issue id `b6d2320a-f63c-463f-97ec-d41f4b7f9617`.
- The live service drop-in `/home/mcp/.config/systemd/user/vibe-kanban.service.d/fixed-ports.conf` sets `HOST=0.0.0.0`, `BACKEND_PORT=4311`, and `PREVIEW_PROXY_PORT=4312`.
- The live service drop-in `/home/mcp/.config/systemd/user/vibe-kanban.service.d/local-auth.conf` sets `VK_DISABLE_AUTH=1`.
- The deployed live binary is `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `8d348fb20f36bb25d0dc0737aa5ae3df6e8e8c2243003bff6ffc27f2985f6525`.
- The latest deployed live binary is `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `4a87753855846cde85227e582c3fb0fc3fe23b297b5cd5fd74c65b802f81cc6b`; the previous binary backup is `/home/mcp/.local/bin/vibe-kanban-serve.backup-20260426-unforkable-rollout`.
- The current latest deployed live binary is `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `aa04de0df56aad09c6180200c332c5cfa56f30125e84462355cf2f8a76a2c733`; the previous binary backup is `/home/mcp/.local/bin/vibe-kanban-serve.backup-20260426-issue-workspace-link`.
- `vibe.local` resolves to the separate LAN nginx proxy at `10.0.0.97`, which proxies to this host on `10.0.0.129:4311`.

## Known Good Validation

- Verified in this session:
  - `cargo fmt --all`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
  - live DB scan after repair: `bad_rollout_agent_session_rows_after 0`
  - `pnpm run format`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p services -p db`
  - `pnpm --filter @vibe/local-web run build`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - deployed rebuilt binary to `/home/mcp/.local/bin/vibe-kanban-serve`
  - `https://vibe.local` returned `200`
  - execution-process WebSocket returned initial snapshot plus `Ready`
  - live `/api/info` returned `login_status: loggedin` and `shared_api_base: null` after the auth drop-in
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p local-deployment -p server`
  - active workspace summaries showed no `running` execution-process statuses before restart
  - rebuilt and redeployed the local-auth hotfix binary to `/home/mcp/.local/bin/vibe-kanban-serve`
  - deployed binary hash matched `target/release/server`
  - restarted `vibe-kanban.service`
  - post-restart service state was `active/running` with `HOST=0.0.0.0`, `BACKEND_PORT=4311`, `PREVIEW_PROXY_PORT=4312`, and `VK_DISABLE_AUTH=1`
  - post-restart `/api/info` returned `login_status: loggedin` and `shared_api_base: null`
  - post-restart `https://vibe.local` returned `200`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p executors -p server`
  - `pnpm run format`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - deployed binary hash matched `target/release/server`: `4a87753855846cde85227e582c3fb0fc3fe23b297b5cd5fd74c65b802f81cc6b`
  - post-fallback-restart service state was `active`
  - post-fallback-restart `/api/info` returned `login_status: loggedin` and `shared_api_base: null`
  - post-fallback-restart `https://vibe.local` returned `200`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db -p server`
  - `pnpm run format`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - deployed binary hash matched `target/release/server`: `aa04de0df56aad09c6180200c332c5cfa56f30125e84462355cf2f8a76a2c733`
  - post-issue-link-restart service state was `active`
  - post-issue-link-restart `/api/info` returned `login_status: loggedin` and `shared_api_base: null`
  - post-issue-link-restart `https://vibe.local` returned `200`
  - live `project_workspaces` showed workspace `915ede80-a3ba-46fc-8665-ed8b368a0bac` linked to issue `b6d2320a-f63c-463f-97ec-d41f4b7f9617`
  - live `/v1/issues` smoke test preserved caller id `48344d12-121d-43cd-bb4f-5abde908d78c`; the temporary issue was deleted and the DB count returned `0`
- Still pending:
  - commit, push, and promote the local issue id preservation hotfix

## What The Next Agent Should Do

- If this handoff is encountered mid-merge, finish conflict resolution instead of restarting the branch.
- Preserve the targeted DB repair approach: clear only invalid rollout anchors, not all historical session ids.
- Preserve the execution-process stream behavior: reconnect cleanly on client close for process streams, and do not forward unrelated non-patch event messages from the server process stream.
- Preserve the fixed LAN bind systemd drop-in unless the proxy is also changed.
- Preserve the local-only auth behavior: no shared API base means no remote sign-in CTA should be required.
- If another `empty session file` appears, scan for the referenced rollout size and DB row before changing code again.
- If another `no rollout found` pointer appears, do not blanket-delete history; the executor fallback should let the prompt continue while a new valid session id self-heals future turns.
- If another new workspace is missing from Issues, first check whether `workspaces.task_id` is null and whether a matching task exists; do not create duplicate tasks to paper over a failed link.

## What The Next Agent Must Not Do

- Do not assume the backup-retention stream is still the active branch here.
- Do not treat stale continuity notes as more authoritative than the checked-out code and branch state.
- Do not re-enable shared API configuration for the local install.
- Do not delete rollout files or erase coding-agent history as a blanket cleanup.
- Do not rebuild/deploy a server binary before rebuilding `packages/local-web/dist` when the fix includes frontend code.
- Do not remove caller-provided issue ids from local fallback `/v1/issues`; the frontend workspace draft depends on that id for linking.

## Verification Required Before Further Changes

- `pnpm run format`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p services -p db`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p executors -p server`
- `pnpm --filter @vibe/local-web run build`
- live DB scan for empty or missing rollout anchors
- smoke test local issue creation with a caller-provided `id`, then delete the temporary issue
- `curl -s http://127.0.0.1:4311/api/info` must show `login_status: loggedin` and `shared_api_base: null`
- `curl -k -I https://vibe.local` must return `200`
- execution-process WebSocket snapshot smoke test

## Verification Status From This Session

- Code-level validation for the DB query guard and event stream guard passed.
- Live DB invalid-anchor repair passed.
- Full repo formatting, frontend build, release build, deployment, `vibe.local`, and execution-process WebSocket smoke tests passed.
- Targeted executor/server compile, format, release build, deploy, service restart, `/api/info`, and `vibe.local` checks passed for the unforkable-rollout fallback.
- Targeted db/server compile, format, release build, deploy, service restart, `/api/info`, `vibe.local`, `project_workspaces`, and issue-id smoke tests passed for the local workspace Issue-link fix.

## Session Metadata

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Focus: repair Codex rollout resume continuity, live invalid rollout anchors, execution-process stale status, `vibe.local` reachability, local-only auth, and local workspace Issue links
