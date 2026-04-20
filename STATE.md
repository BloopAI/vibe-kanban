# STATE.md

## Current Objective

- Keep the local Vibe Kanban install stable, local-only, recoverable, and usable for day-to-day project work without sidebar clutter.

## Confirmed Current State

- Local runtime is active and serving from the rebuilt local binary.
- `/api/info` reports `shared_api_base: null`.
- An isolated lab instance exists at `127.0.0.1:4411` with separate state and separate `CODEX_HOME`.
- Two frontend polling regressions that contributed to VK hangs are fixed in the current local runtime and in `staging`:
  - `packages/web-core/src/shared/hooks/useWorkspaces.ts`
  - `packages/web-core/src/shared/hooks/useUiPreferencesScratch.ts`
  - `packages/web-core/src/shared/hooks/useBranchStatus.ts`
  - `packages/web-core/src/shared/hooks/useTaskWorkspaces.ts`
- Verified after the fix:
  - repeated mixed board/workspace bursts passed with `0` failures
  - a 2-minute mixed soak (`21,070` requests) passed with `0` failures
  - live service stayed around `90 MB RSS` with `0` swap instead of re-bloating into the multi-GB range
- Additional controlled workspace-open emulation also passed:
  - `OpsPB::Linking in reports`
  - `VK:: Wire Ntfy`
  - `Vk::Ops`
  - stayed roughly in the `32–51 MB` range with `0` endpoint failures
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
- The remaining unresolved stability problem is being moved toward an isolated test-instance workflow instead of continuing diagnosis directly in prod VK.

## Proposed / Not Adopted

- Reintroducing remote/shared cloud-backed board behavior.
- Treating GitHub-only state as a substitute for VK local-state backups.

## Known Gaps / Blockers / Deferred

- Some historic board metadata can only be recovered if it existed in the cloud export or local DB snapshots; completely empty lost custom columns cannot be inferred safely.
- The local fallback pull-request endpoint still returns project-wide PR data and should be narrowed by `issue_id` in a future cleanup pass.
- The archive/restore flow is currently implemented for local projects; remote/cloud project archiving remains out of scope.
- The branch-local backup retention change needs to be merged from its dedicated PR before treating it as landed in `staging`.
- The recent memory spiral was partly traced to repo-side frontend request/write behavior, not to the local-only install mode itself.
- However, VK is still not fully fixed:
  - there is a remaining heavy-child / SQLite-lock / memory-retention path
  - under several live attached child processes, VK can still re-bloat into the `9+ GB` range
  - then `database is locked` errors can break `POST /api/workspaces/start` and `POST /api/workspaces/summaries`
- That remaining bug is not yet isolated well enough to package upstream again.
- Best current lab diagnosis:
  - SQLite `DELETE` mode was a real contributor
  - ignored PR monitor disable was real background churn
  - missing unseen-turn index was real, but smaller than the DB-mode problem
  - the remaining hotspot is still `UI_PREFERENCES` scratch upsert churn
- Important nuance:
  - `_vibe_kanban_repo` is not uniquely bad because of raw repo size or raw git speed
  - it is a stronger trigger because `vibe-kanban` tasks tend to run preview/dev-server/self-hosting workloads inside VK

## Relevant Files / Modules

- `HANDOFF.md`
- `STATE.md`
- `STREAM.md`
- `DELTA.md`
- `crates/db/src/lib.rs`
- `crates/local-deployment/src/lib.rs`
- `crates/services/src/services/pr_monitor.rs`
- `crates/db/src/models/coding_agent_turn.rs`
- `crates/services/src/services/events.rs`
- `crates/server/src/routes/scratch.rs`
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
- `packages/web-core/src/shared/hooks/useWorkspaces.ts`
- `packages/web-core/src/shared/hooks/useUiPreferencesScratch.ts`

## Decisions Currently In Force

- Operate VK in local-only mode.
- Use the lean backup + Desktop mirror as the standard recovery path.
- Apply retention to lean backups so the default recovery path stays sustainable over time.
- Start new repo work from `staging`.
- Treat the local DB plus GitHub state as the combined restore source, not the old cloud.
- Keep inactive local projects out of the primary left-column list by archiving them instead of leaving them permanently visible.
- Keep prod VK usable for day-to-day work, but do further root-cause debugging in a separate test instance where restarts and instrumentation are safe.
- Do not port lab findings to prod or `staging` without explicit user confirmation.

## Risks / Regression Traps

- Reintroducing shared API env vars will put the install back into a mixed local/remote state.
- Deleting or replacing the local DB without a fresh backup will break the current restore guarantee.
- UI changes that hide PR badges or issue/workspace links can look like data loss even when the DB is correct.
- UI changes that hide archived local projects must still provide a clear restore path or they will look like missing data.
- Replacing VK `CODEX_HOME` with a fresh directory and copying only `auth.json` will break old workspace thread fork/resume with `no rollout found for thread id ...`.
- VK Codex isolation requires both auth and Codex session/rollout state if you want existing workspace threads to continue cleanly after the switch.
- Passing raw HTTP stress tests is not enough. The earlier false positive came from not reproducing:
  - mounted workspace UI behavior
  - repeated workspace/task polling
  - live attached coding-agent / preview child-process load
- If prod VK wedges and `systemctl --user restart vibe-kanban.service` gets stuck in `deactivating (stop-sigterm)`, the safe recovery path is:
  - back up `db.v2.sqlite`
  - wait briefly for graceful cleanup
  - if still stuck, force-kill only the VK main PID and let systemd respawn it
  - do not touch tmux or unrelated Codex sessions

## Next Safe Steps

1. Continue feature work from `staging`.
2. Let the hourly lean backup cron keep running, or trigger a manual backup before risky work.
3. If a future agent touches board/workspace loading again, rerun a burst + soak check against:
   - `/api/workspaces/summaries`
   - `/v1/fallback/issues?project_id=...`
   - `/v1/fallback/project_workspaces?project_id=...`
   - `/api/workspaces/:id/git/status`
4. If a future agent touches project/workspace linking or project-list visibility, verify through the live API and the UI before merging.
5. Stand up an isolated test instance from current prod state before continuing root-cause work on the remaining memory / DB-lock path.
6. Continue validating lab-only backend fixes in this order:
   - DB mode / pool / monitor control
   - scratch write amplification
   - then longer soak runs with repeated `_vibe_kanban_repo` workspace starts
Lab findings, 2026-04-19:

- The DB-side fixes being tested in the lab are materially helping:
  - SQLite `WAL`
  - reduced pool size
  - PR monitor actually disabled
  - `UI_PREFERENCES` scratch coalescing / reduced scratch fanout
- After those fixes, the main remaining `vibe-kanban` trigger is heavy preview/install child workload, not the VK server heap itself.
- A lab-only prototype now runs Codex/script executions in transient user services via `systemd-run`.
- In that configuration:
  - the main lab VK service stayed roughly `117-222 MB`
  - the heavy preview/install load moved into a separate transient `vk-lab-codex-*.service`
  - stopping the workspace via VK successfully removed the transient unit
- This strongly suggests the remaining production hardening path is:
  1. keep the DB/scratch fixes
  2. isolate heavy executions into separate units/cgroups
  3. add explicit unit tracking and cleanup

This is still lab-only. Do not port any of it to prod or `staging` without explicit user confirmation.

Production state, 2026-04-20:

- The confirmed lab fixes are now deployed in production.
- Current production hardening includes:
  - SQLite `WAL`
  - DB pool capped to `8`
  - SQLite busy timeout enabled
  - PR monitor truly disabled when `VK_DISABLE_PR_MONITOR=1`
  - direct scratch event emission from the scratch route
  - `UI_PREFERENCES` scratch write coalescing
  - heavy Codex/script executions launched in transient user services through `systemd-run`
- Current prod launcher env includes:
  - `VK_USE_SYSTEMD_RUN=1`
  - `VK_TRANSIENT_MEMORY_HIGH=1500M`
  - `VK_TRANSIENT_MEMORY_MAX=3000M`
- Confirmed prod behavior after rollout:
  - main VK service stayed around `116-117 MB` during a real no-op Codex execution
  - the execution ran in a separate `vk-exec-codex-*.service`
  - the transient unit cleaned up after completion
