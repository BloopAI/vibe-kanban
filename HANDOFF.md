# HANDOFF.md

## What Changed This Session

- Investigated Codex rollout continuity failures from the live local Vibe Kanban install.
- Added a DB-level resume guard so failed or incomplete coding-agent turns are not selected as continuity anchors.
- Backed up the live DB and cleared only invalid `agent_session_id` pointers whose rollout files were empty or missing.
- Fixed `vibe.local` 502 by restoring the local service bind address for the LAN reverse proxy.
- Added execution-process stream reconnect/server filtering so mounted workspace pages do not stay stuck showing agents as running after the stream closes.
- Opened PR `#37` for the hotfix and began merging current `fork/staging` into the hotfix branch so the fix can be promoted without being lost.
- Refreshed branch-local continuity docs for this repair stream after resolving staging merge conflicts.

## What Is True Right Now

- The live local install remains the source of truth.
- The checked-out branch in this worktree is `vk/ea3c-vk-auto-archive`.
- PR `#37` targets `staging` from this branch.
- `crates/db/src/models/coding_agent_turn.rs` now only returns resumable session info from completed, exit-0 coding-agent turns with a non-empty summary.
- The reported empty rollout `019dc72a-9fba-7961-9c36-a3f8f8a63036` cannot be reconstructed because the persisted JSONL file is zero bytes.
- The reported rollout `019dc9bd-ef72-76f2-b08e-4c83659f0369` exists and is non-empty; its late `thread not found` log did not indicate an empty rollout.
- The live DB now has zero `agent_session_id` pointers to empty or missing rollout files.
- The live DB backup is `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`.
- The live service drop-in `/home/mcp/.config/systemd/user/vibe-kanban.service.d/fixed-ports.conf` sets `HOST=0.0.0.0`, `BACKEND_PORT=4311`, and `PREVIEW_PROXY_PORT=4312`.
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
- Still pending:
  - finish staging merge validation and merge PR `#37` if GitHub accepts it

## What The Next Agent Should Do

- If this handoff is encountered mid-merge, finish conflict resolution instead of restarting the branch.
- Preserve the targeted DB repair approach: clear only invalid rollout anchors, not all historical session ids.
- Preserve the execution-process stream behavior: reconnect cleanly on client close for process streams, and do not forward unrelated non-patch event messages from the server process stream.
- Preserve the fixed LAN bind systemd drop-in unless the proxy is also changed.
- If another `empty session file` appears, scan for the referenced rollout size and DB row before changing code again.

## What The Next Agent Must Not Do

- Do not assume the backup-retention stream is still the active branch here.
- Do not treat stale continuity notes as more authoritative than the checked-out code and branch state.
- Do not re-enable shared API configuration for the local install.
- Do not delete rollout files or erase coding-agent history as a blanket cleanup.
- Do not rebuild/deploy a server binary before rebuilding `packages/local-web/dist` when the fix includes frontend code.

## Verification Required Before Further Changes

- `pnpm run format`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p services -p db`
- `pnpm --filter @vibe/local-web run build`
- live DB scan for empty or missing rollout anchors
- `curl -k -I https://vibe.local`
- execution-process WebSocket snapshot smoke test

## Verification Status From This Session

- Code-level validation for the DB query guard and event stream guard passed.
- Live DB invalid-anchor repair passed.
- Full repo formatting, frontend build, release build, deployment, `vibe.local`, and execution-process WebSocket smoke tests passed.

## Session Metadata

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Focus: repair Codex rollout resume continuity, live invalid rollout anchors, execution-process stale status, and `vibe.local` reachability
