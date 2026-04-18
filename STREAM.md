# STREAM.md

## Stream Identifier

- Branch: `staging`
- Repo: `/home/mcp/_vibe_kanban_repo`
- Working mode: local-only VK maintenance plus normal feature work

## Objective

- Maintain a stable, local-only Vibe Kanban instance that can be restored from backup plus GitHub without guesswork.

## In Scope

- Local-only runtime stability
- Local issue/project/workspace behavior
- Backup and restore reliability
- Restoring or repairing local workspace and PR metadata when the DB is incomplete

## Out of Scope

- Reviving the old cloud-backed board model
- Depending on `api.vibekanban.com` for local board state

## Stream-Specific Decisions

- `staging` is the working base branch.
- The local install must keep `shared_api_base` disabled.
- The lean backup system is the default backup path; the full-state backup is the heavy fallback.

## Relevant Files / Modules

- `docs/self-hosting/local-backup-recovery.mdx`
- `scripts/vk_lean_backup.py`
- `scripts/run_vk_lean_backup.sh`
- `scripts/vk_restore_lean_backup.py`
- `scripts/run_vk_restore_latest.sh`
- `packages/ui/src/components/IssueWorkspaceCard.tsx`
- local DB: `~/.local/share/vibe-kanban/db.v2.sqlite`

## Current Status

- Confirmed:
  - hourly lean backup cron is installed
  - Desktop mirror copy is active
  - local issue creation works
  - local workspace creation/linking works
  - project settings and local columns are working again
  - restored merged PR indicators for repaired issues/workspaces
- Pending:
  - optional cleanup of project-scoped PR fallback filtering
  - any future feature work unrelated to recovery

## Risks / Regression Traps

- Confusing UI regressions with actual DB loss
- Repointing the service back to cloud/shared API config
- Forgetting to validate issue/workspace linking after changes in the kanban UI

## Next Safe Steps

1. Branch new work from `staging`.
2. Keep the local-only runtime intact.
3. Use the lean backup before risky changes.
