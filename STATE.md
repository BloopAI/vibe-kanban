# STATE.md

## Current Objective

- Keep the local Vibe Kanban install stable, local-only, recoverable, and usable for day-to-day project work without sidebar clutter.

## Confirmed Current State

- Local runtime is active and serving from the rebuilt local binary.
- `/api/info` reports `shared_api_base: null`.
- The imported cloud project/issue data has been brought into the local DB.
- The `vibe-kanban` project can currently create issues and create/link workspaces successfully.
- Local projects now support archive/restore behavior in the left-column project navigation.
- Lean local backups now have tiered retention instead of unbounded growth.
- `staging` is the correct repo base for new VK development.
- VK now uses an isolated Codex home at `/home/mcp/.local/share/vibe-kanban/codex-home`.
- That isolation exists specifically to stop VK coding agents from sharing refresh-token rotation with tmux/interactive Codex sessions.

## In Progress

- Normal project work can resume. No recovery-only blocker remains for issue/workspace creation in the `vibe-kanban` project.
- Branch-local work is adding local project list hygiene without reintroducing cloud/shared state.

## Proposed / Not Adopted

- Reintroducing remote/shared cloud-backed board behavior.
- Treating GitHub-only state as a substitute for VK local-state backups.

## Known Gaps / Blockers / Deferred

- Some historic board metadata can only be recovered if it existed in the cloud export or local DB snapshots; completely empty lost custom columns cannot be inferred safely.
- The local fallback pull-request endpoint still returns project-wide PR data and should be narrowed by `issue_id` in a future cleanup pass.
- The archive/restore flow is currently implemented for local projects; remote/cloud project archiving remains out of scope.
- The branch-local backup retention change needs to be merged from its dedicated PR before treating it as landed in `staging`.

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
- `scripts/prune_vk_backups.py`
- `crates/db/src/models/project.rs`
- `crates/server/src/routes/projects.rs`
- `packages/ui/src/components/AppBar.tsx`
- `packages/web-core/src/features/kanban/ui/KanbanContainer.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`

## Decisions Currently In Force

- Operate VK in local-only mode.
- Use the lean backup + Desktop mirror as the standard recovery path.
- Apply retention to lean backups so the default recovery path stays sustainable over time.
- Start new repo work from `staging`.
- Treat the local DB plus GitHub state as the combined restore source, not the old cloud.
- Keep inactive local projects out of the primary left-column list by archiving them instead of leaving them permanently visible.

## Risks / Regression Traps

- Reintroducing shared API env vars will put the install back into a mixed local/remote state.
- Deleting or replacing the local DB without a fresh backup will break the current restore guarantee.
- UI changes that hide PR badges or issue/workspace links can look like data loss even when the DB is correct.
- UI changes that hide archived local projects must still provide a clear restore path or they will look like missing data.
- Replacing VK `CODEX_HOME` with a fresh directory and copying only `auth.json` will break old workspace thread fork/resume with `no rollout found for thread id ...`.
- VK Codex isolation requires both auth and Codex session/rollout state if you want existing workspace threads to continue cleanly after the switch.

## Next Safe Steps

1. Continue feature work from `staging`.
2. Let the hourly lean backup cron keep running, or trigger a manual backup before risky work.
3. If a future agent touches project/workspace linking or project-list visibility, verify through the live API and the UI before merging.
