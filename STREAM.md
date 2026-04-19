# STREAM.md

## Stream Identifier

- Branch: `vk/ops-backup-retention-20260419`
- Repo: `/home/mcp/_vibe_kanban_repo`
- Working mode: local-only VK maintenance branch

## Objective

- Add tiered retention to lean local VK backups so backups remain sustainable without manual cleanup.

## In Scope

- Local-only runtime stability
- Lean backup retention behavior
- Recovery documentation for the lean backup path

## Out of Scope

- Reviving the old cloud-backed board model
- Depending on `api.vibekanban.com` for local board state
- Refactoring unrelated workspace or project UI behavior in this branch

## Stream-Specific Decisions

- `staging` is the base branch; this stream lands through a PR back into `staging`.
- The local install must keep `shared_api_base` disabled.
- The lean backup path stays the default recovery mechanism.
- Retention should be handled in the backup tooling itself rather than by ad hoc operator cleanup.

## Relevant Files / Modules

- `scripts/vk_lean_backup.py`
- `docs/self-hosting/local-backup-recovery.mdx`
- local backup paths under `/home/mcp/backups/`
- Desktop mirror under `~/Desktop/vk-backups/`

## Current Status

- Confirmed:
  - tiered retention logic is isolated on this branch as one commit on top of current `staging`
  - backup docs are being aligned to the retention behavior
- Pending:
  - push doc updates into PR `#6`
  - merge PR `#6` into `staging`

## Risks / Regression Traps

- Accidentally pruning the newest valid lean restore snapshot
- Repointing the service back to cloud/shared API config
- Updating retention behavior without matching operator docs

## Next Safe Steps

1. Branch new work from `staging`.
2. Keep the local-only runtime intact.
3. After this PR lands, resume landing other queued branches one at a time into the refreshed `staging`.
