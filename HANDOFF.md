# HANDOFF.md

## What Changed This Session

- Preserved the old divergent canonical `staging` tip on rescue branches.
- Reset the canonical local `staging` checkout to match `fork/staging`.
- Split `ca67946ab` into a clean branch, `vk/ops-backup-retention-20260419`.
- Opened PR `#6` for the backup retention change.
- Updated the branch-local continuity docs so they match the backup retention stream.

## What Is True Right Now

- The live local install is the source of truth.
- `/api/info` reports `shared_api_base: null`.
- The board/issue data now lives locally in `~/.local/share/vibe-kanban/db.v2.sqlite`.
- The canonical local checkout is back on a clean `staging` that matches `fork/staging`.
- The active branch for this stream is `vk/ops-backup-retention-20260419`.
- PR `#6` is the isolated path for `ops(backups): add tiered lean backup retention`.

## Known Good Validation

- Git history sync checks passed:
  - canonical `staging` now matches `fork/staging`
  - `vk/ops-backup-retention-20260419` is exactly one commit ahead of `staging`
- Not rerun in this cleanup stream:
  - repo build/test validation for the backup retention change itself

## What The Next Agent Should Do

- Merge PR `#6`.
- Keep the rescue branches until there is no more need to recover anything from the old divergent `staging`.
- After PR `#6` lands, bring the remaining queued PRs to `staging` one at a time.

## What The Next Agent Must Not Do

- Do not re-enable `VK_SHARED_API_BASE` or `VK_SHARED_RELAY_API_BASE` for the local install.
- Do not delete the rescue branches before confirming the divergence cleanup is complete.
- Do not reintroduce direct local-only commits onto the canonical `staging` checkout.
- Do not assume PR `#6` has fresh validation beyond the preserved commit history unless it is rerun explicitly.

## Verification Required Before Further Changes

- `curl -s http://127.0.0.1:4311/api/info` and confirm `shared_api_base` is `null`
- `git status --short --branch`
- Task-specific validation for backup retention behavior if the change is modified further

## Verification Status From This Session

- canonical `staging` sync cleanup completed
- PR `#6` exists for the isolated backup retention commit
- branch-local docs now match the backup retention stream

## Session Metadata

- Branch: `vk/ops-backup-retention-20260419`
- Repo: `/home/mcp/_vibe_kanban_repo`
- Focus: canonical staging sync cleanup plus isolated backup retention PR
