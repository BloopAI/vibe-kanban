# STATE.md

## Current Objective

- Keep the local Vibe Kanban install stable, local-only, and recoverable while normal project work continues again inside VK.

## Confirmed Current State

- Local runtime is active and serving from the rebuilt local binary.
- `/api/info` reports `shared_api_base: null`.
- The imported cloud project/issue data has been brought into the local DB.
- The `vibe-kanban` project can currently create issues and create/link workspaces successfully.
- `staging` is the correct repo base for new VK development.

## In Progress

- Normal project work can resume. No recovery-only blocker remains for issue/workspace creation in the `vibe-kanban` project.

## Proposed / Not Adopted

- Reintroducing remote/shared cloud-backed board behavior.
- Treating GitHub-only state as a substitute for VK local-state backups.

## Known Gaps / Blockers / Deferred

- Some historic board metadata can only be recovered if it existed in the cloud export or local DB snapshots; completely empty lost custom columns cannot be inferred safely.
- The local fallback pull-request endpoint still returns project-wide PR data and should be narrowed by `issue_id` in a future cleanup pass.

## Relevant Files / Modules

- `HANDOFF.md`
- `STATE.md`
- `STREAM.md`
- `DELTA.md`
- `docs/self-hosting/local-backup-recovery.mdx`
- `scripts/vk_lean_backup.py`
- `scripts/run_vk_lean_backup.sh`
- `scripts/vk_restore_lean_backup.py`
- `scripts/run_vk_restore_latest.sh`
- `packages/ui/src/components/IssueWorkspaceCard.tsx`

## Decisions Currently In Force

- Operate VK in local-only mode.
- Use the lean backup + Desktop mirror as the standard recovery path.
- Start new repo work from `staging`.
- Treat the local DB plus GitHub state as the combined restore source, not the old cloud.

## Risks / Regression Traps

- Reintroducing shared API env vars will put the install back into a mixed local/remote state.
- Deleting or replacing the local DB without a fresh backup will break the current restore guarantee.
- UI changes that hide PR badges or issue/workspace links can look like data loss even when the DB is correct.

## Next Safe Steps

1. Continue feature work from `staging`.
2. Let the hourly lean backup cron keep running, or trigger a manual backup before risky work.
3. If a future agent touches project/workspace linking, verify through the live API and the UI before merging.
