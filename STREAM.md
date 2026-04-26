# STREAM.md

## Stream Identifier

- Branch: `vk/ea3c-vk-auto-archive`
- Repo: `/home/mcp/code/worktrees/ea3c-vk-auto-archive/_vibe_kanban_repo`
- Working mode: local-only VK maintenance worktree

## Objective

- Repair local Codex rollout continuity so failed or corrupt agent launches cannot poison follow-up turns.

## In Scope

- Truthful branch-local continuity for this worktree
- Guarding resume/fork selection against failed coding-agent turns
- Repairing live local DB continuity pointers that reference empty or missing rollout files
- Preserving the local-only runtime baseline

## Out of Scope

- Reconstructing the old backup-retention branch context as if it were still checked out here
- Re-enabling shared/cloud API behavior
- Reconstructing a zero-byte Codex rollout file that has no persisted content

## Stream-Specific Decisions

- The checked-out tip is `88c0ebd59` (`fix: stop workspace status polling churn`).
- Local runtime expectations from `STATE.md` remain in force, including `shared_api_base: null`.
- Resume continuity should only anchor to successful coding-agent turns: completed process, exit code `0`, non-null agent session id, and non-empty final summary.
- Empty or missing rollout files are live-state corruption, not valid resume anchors.

## Relevant Files / Modules

- `STREAM.md`
- `HANDOFF.md`
- `DELTA.md`
- `STATE.md`
- `crates/db/src/models/coding_agent_turn.rs`
- `/home/mcp/.local/share/vibe-kanban/db.v2.sqlite`
- `/home/mcp/.local/share/vibe-kanban/codex-home/sessions`

## Current Status

- Confirmed:
  - the reported zero-byte rollout was `019dc72a-9fba-7961-9c36-a3f8f8a63036`
  - the reported `019dc9bd-ef72-76f2-b08e-4c83659f0369` rollout is non-empty
  - the live DB repair cleared four invalid `agent_session_id` pointers whose rollout files were empty or missing
  - a DB backup was saved at `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`
- Pending:
  - rebuild/restart the local service after validation if the running install should receive the code guard immediately

## Risks / Regression Traps

- Trusting stale continuity docs instead of the checked-out branch and code
- Treating any non-null `agent_session_id` as resumable without checking the source process outcome
- Nulling all historical agent session IDs instead of only invalid live-state pointers

## Next Safe Steps

1. Finish validation for the DB query guard.
2. Rebuild and restart the local service if the live install should use the guard immediately.
3. Recheck that no DB `agent_session_id` pointers reference empty or missing rollout files.
