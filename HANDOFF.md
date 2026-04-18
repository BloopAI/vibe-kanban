# HANDOFF.md

## What Changed This Session

- Recovered the local VK board state from the cloud export and imported it into the local SQLite DB.
- Converted the live install to local-only runtime behavior by removing the active shared API base from the running service.
- Restored local board behavior that had regressed during recovery:
  - issue creation
  - workspace creation/link refresh
  - project settings menu and local column editing
  - workspace history scroll
  - PR badges on issue workspace cards
- Re-linked missing issue/workspace pairs and restored missing local PR metadata for merged workspaces.
- Added and documented the lean backup + one-click restore flow and installed the hourly backup cron job with Desktop mirroring.

## What Is True Right Now

- The live local install is the source of truth.
- `/api/info` reports `shared_api_base: null`.
- The board/issue data now lives locally in `~/.local/share/vibe-kanban/db.v2.sqlite`.
- `staging` is the branch to use as the current repo base.
- The repo is in a clean state after the latest local-only fix commits.

## Known Good Backups

- Lean restore latest:
  - `/home/mcp/backups/vk-lean-restore-latest`
  - `/home/mcp/backups/vk-lean-restore-latest.tar.gz`
- Matching Desktop mirror:
  - `Desktop/vk-backups/vk-lean-restore-latest.tar.gz`
- Larger full-state snapshot:
  - `/home/mcp/backups/vk-complete-state-20260418T205324Z`

## What The Next Agent Should Do

- Start new VK repo work from `staging`.
- Take the lean backup before risky schema/runtime changes if the hourly backup is not fresh enough for the task.
- Keep the local-only behavior intact unless there is an explicit reason to reintroduce remote/cloud functionality.
- Prefer verifying issue/workspace/project behavior through the live local API before assuming the UI is right.

## What The Next Agent Must Not Do

- Do not re-enable `VK_SHARED_API_BASE` or `VK_SHARED_RELAY_API_BASE` for the local install.
- Do not claim a DB-only copy is a full backup.
- Do not wipe or replace the local DB without first taking a new lean restore backup.
- Do not assume missing PR badges mean the PR is unmerged; check the local `pull_requests` rows first.

## Verification Required Before Further Changes

- `curl -s http://127.0.0.1:4311/api/info` and confirm `shared_api_base` is `null`
- `git status --short --branch`
- Task-specific validation for any runtime or UI change

## Verification Status From This Session

- Temporary smoke test passed against the live `vibe-kanban` project:
  - created a temporary issue
  - created a linked workspace against `_vibe_kanban_repo`
  - verified the workspace appeared under the issue immediately
  - stopped/deleted the workspace and removed the test issue cleanly
- Hyrox issue/workspace/PR regressions were repaired locally:
  - `ART-57` workspace re-linked
  - `ART-60` merged PR `#799` restored
  - `ART-61` merged PR `#800` restored
  - `T42` merged PR `#801` restored
- PR badges now render on small issue cards.

## Session Metadata

- Branch: `staging`
- Repo: `/home/mcp/_vibe_kanban_repo`
- Focus: local-only stabilization, recoverability, and project/issue/workspace repair
