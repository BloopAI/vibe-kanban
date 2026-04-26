# HANDOFF.md

## What Changed This Session

- Investigated Codex rollout continuity failures from the live local Vibe Kanban install.
- Added a DB-level resume guard so failed or incomplete coding-agent turns are not selected as continuity anchors.
- Backed up the live DB and cleared only invalid `agent_session_id` pointers whose rollout files were empty or missing.
- Refreshed branch-local continuity docs for this repair stream.

## What Is True Right Now

- The live local install remains the source of truth.
- The checked-out branch in this worktree is `vk/ea3c-vk-auto-archive`.
- `crates/db/src/models/coding_agent_turn.rs` now only returns resumable session info from completed, exit-0 coding-agent turns with a non-empty summary.
- The reported empty rollout `019dc72a-9fba-7961-9c36-a3f8f8a63036` cannot be reconstructed because the persisted JSONL file is zero bytes.
- The reported rollout `019dc9bd-ef72-76f2-b08e-4c83659f0369` exists and is non-empty; its late `thread not found` log did not indicate an empty rollout.
- The live DB now has zero `agent_session_id` pointers to empty or missing rollout files.
- The live DB backup is `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`.

## Known Good Validation

- Verified in this session:
  - `cargo fmt --all`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
  - live DB scan after repair: `bad_rollout_agent_session_rows_after 0`
- Still pending:
  - `pnpm run format`
  - service rebuild/restart if this worktree should be deployed to the running local install immediately

## What The Next Agent Should Do

- Finish validation and deploy the guarded server binary to the local service if not already done.
- Preserve the targeted DB repair approach: clear only invalid rollout anchors, not all historical session ids.
- If another `empty session file` appears, scan for the referenced rollout size and DB row before changing code again.

## What The Next Agent Must Not Do

- Do not assume the backup-retention stream is still the active branch here.
- Do not treat stale continuity notes as more authoritative than the checked-out code and branch state.
- Do not re-enable shared API configuration for the local install.
- Do not delete rollout files or erase coding-agent history as a blanket cleanup.

## Verification Required Before Further Changes

- `pnpm run format`
- `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
- live DB scan for empty or missing rollout anchors

## Verification Status From This Session

- Code-level validation for the DB query guard passed.
- Live DB invalid-anchor repair passed.
- Full repo formatting and live service deployment still need final confirmation if not completed later in this session.

## Session Metadata

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Focus: repair Codex rollout resume continuity and live invalid rollout anchors
