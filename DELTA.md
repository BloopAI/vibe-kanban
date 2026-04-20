# DELTA.md

## 2026-04-18T00:00:00Z | staging | local-only recovery baseline

- Intent: recover the usable VK board state, remove active cloud coupling, and make the local install restorable.
- Completed:
  - imported the VK cloud export into the local SQLite DB
  - switched the live runtime to local-only behavior (`shared_api_base: null`)
  - restored project settings, local columns, issue creation, workspace linking, and workspace history scroll
  - added lean backup + one-click restore scripts
  - installed hourly backup cron with Desktop archive mirroring
- Verified:
  - local API reports `shared_api_base: null`
  - project boards and issues load locally
  - backups are created locally and mirrored to Desktop
- Not complete / known gaps:
  - some historic metadata can only be reconstructed if present in export or DB snapshots
  - project-scoped PR fallback is still broader than it should be

## 2026-04-18T22:00:00Z | staging | hyrox issue/workspace/PR repair

- Intent: repair missing workspace links and merged PR indicators in the `hyroxready-app` kanban after local recovery.
- Completed:
  - re-linked `ART-57` to `FR::Cardio Timer Font Size`
  - restored merged PR metadata for:
    - `ART-60` -> `#799`
    - `ART-61` -> `#800`
    - `T42` -> `#801`
  - updated issue workspace cards so PR badges are visible on small/narrow layouts
- Files changed:
  - `packages/ui/src/components/IssueWorkspaceCard.tsx`
- Backups:
  - `/home/mcp/backups/vk-hyrox-pr-workspace-fix-20260418T223433Z`
  - `/home/mcp/backups/vk-hyrox-ui-rollout-20260418T224435Z`
  - `/home/mcp/backups/vk-t42-pr-fix-20260418T233203Z`
- Verified:
  - local fallback API shows the repaired issue/workspace/PR links
  - live bundle rolled to `index-tPwgyQmd.js`
  - fix committed to `staging` as `1ad3ed085`

## 2026-04-18T23:00:00Z | staging | vibe-kanban project smoke test

- Intent: prove the `vibe-kanban` project can resume normal issue/workspace work locally.
- Completed:
  - created a temporary issue in the `vibe-kanban` project
  - created a linked workspace against `_vibe_kanban_repo`
  - verified the workspace appeared under the issue immediately
  - stopped and deleted the temporary workspace
  - deleted the temporary issue
- Verified:
  - local issue creation works
  - local workspace creation works
  - workspace linking/refresh works
- Not complete / known gaps:
  - none blocking normal project work in the `vibe-kanban` board

## 2026-04-18T23:45:00Z | vk/cc95-vk-archive-proje | local project archive flow

- Intent: keep the local left-column project list manageable by hiding inactive projects behind an archive/restore flow.
- Completed:
  - added a persistent `archived` flag to local projects
  - exposed local project archive updates through `/api/projects/:project_id`
  - hid archived local projects from the main AppBar/mobile drawer list and surfaced them in an Archived restore section
  - added an archive action to the local project settings dialog
  - regenerated `shared/types.ts`
- Verified:
  - `cargo run --bin generate_types`
  - `cargo fmt --all`
- Not complete / known gaps:
  - full frontend formatting/typecheck could not run in this worktree because `prettier` and `tsc` are not installed
  - full `cargo check --workspace` was started but not waited through to completion after the successful type-generation build

## 2026-04-19T10:30:00Z | vk/ops-backup-retention-20260419 | canonical staging sync cleanup

- Intent: repair the divergent canonical local `staging` checkout and preserve only the backup retention change as its own normal PR.
- Completed:
  - preserved the old divergent local `staging` tip on rescue branches
  - reset canonical local `staging` to `fork/staging`
  - replayed `ca67946ab` onto `vk/ops-backup-retention-20260419`
  - opened PR `#6` for the isolated backup retention change
  - refreshed branch-local continuity docs for the backup retention stream
- Verified:
  - canonical `staging` matches `fork/staging`
  - `vk/ops-backup-retention-20260419` is one commit ahead of `staging`
- Not complete / known gaps:
  - PR `#6` still needs merge
  - backup retention validation was not rerun during the sync cleanup step
# 2026-04-19 Workspace Polling Hotfix

- A second frontend churn path was identified after the earlier kanban/sidebar fix.
- Root cause: mounted workspace views were still polling branch status and issue-linked workspaces every 5 seconds.
- Primary files:
  - `packages/web-core/src/shared/hooks/useBranchStatus.ts`
  - `packages/web-core/src/shared/hooks/useTaskWorkspaces.ts`
- Fix:
  - disable default 5s polling for both hooks
  - add `staleTime`
  - disable `refetchOnWindowFocus`
  - disable `refetchOnMount`
- Why this mattered:
  - the first stress test only exercised raw HTTP endpoints and missed the browser-mounted polling path
  - real workspace UI usage could still drive repeated `/api/workspaces/:id/git/status` and `/api/workspaces?task_id=...` calls
  - under sustained live use, that recreated the same multi-GB server bloat / timeout pattern
- Post-fix validation:
  - repeated workspace-open emulation for `OpsPB::Linking in reports`, `VK:: Wire Ntfy`, and `Vk::Ops`
  - combined polling plus summaries POST load
  - no endpoint failures
  - RSS stayed roughly in the `32–51 MB` range instead of climbing into GB territory

# 2026-04-19 Remaining Unfixed Path

- The system is still not fully fixed.
- After the two frontend polling fixes, prod VK can still re-bloat into the `9+ GB` range under a different path:
  - several live attached Codex / preview / git child processes
  - SQLite lock contention
  - `POST /api/workspaces/start` and `POST /api/workspaces/summaries` returning `500`
  - `database is locked`
- That path has not been root-caused yet.
- It does not currently look like a simple frontend polling regression anymore.
- Current plan is to continue root-cause work in an isolated lab/test instance, not directly in prod VK.

# 2026-04-19 Lab SQL / Scratch Investigation

- Intent: move the remaining VK stability diagnosis into an isolated lab instance and stop guessing on prod.
- Lab setup:
  - isolated VK lab on `127.0.0.1:4411`
  - separate state root
  - separate `CODEX_HOME`
  - no prod changes
- Confirmed in the lab:
  - SQLite `DELETE` journaling was a real contributor to the backend stalls
  - `VK_DISABLE_PR_MONITOR=1` was being ignored before lab patching
  - the unseen-turn query needed an unseen-turn index
  - `_vibe_kanban_repo` is a stronger trigger because the work done there is often preview/dev-server/self-hosting heavy, not because raw git status is uniquely slow
- Measured improvement from `WAL` + lower DB pool + real PR monitor disable:
  - same mixed read/write stress workload improved materially
  - long soak with repeated `_vibe_kanban_repo` workspace starts completed with `0` failures
  - no `database is locked`
  - no pool timeouts
- Additional lab-only scratch fanout change:
  - scratch create/update notifications now bypass the generic DB hook path in the lab
  - this reduced the short-run scratch tail and improved memory behavior further
- Still not fully fixed:
  - the remaining hotspot is `UI_PREFERENCES` scratch upserts
  - they still occasionally land in the `1-2.2s` range under prolonged soak
- Current best next step:
  - reduce/coalesce `UI_PREFERENCES` write pressure in the lab
  - do not port any of these lab fixes to prod or `staging` without explicit user confirmation

# 2026-04-19 Prod Recovery Note

- Prod VK was successfully recovered after getting stuck in `deactivating (stop-sigterm)`.
- Safe recovery sequence used:
  - back up `db.v2.sqlite`
  - attempt normal `systemctl --user restart vibe-kanban.service`
  - if the old service remains stuck in `stop-sigterm`, force-kill only the stuck VK main PID
  - let systemd bring up a fresh instance
- This recovery path is acceptable for VK service-only incidents.
- Do not apply that logic to tmux or unrelated Codex sessions.
- 2026-04-19: backup retention corrected so hourly lean backups do not keep every extracted directory locally. Keep only the newest unpacked restore directory on MCP; retain older runs as `.tar.gz` archives plus Desktop mirror. This dropped `/home/mcp/backups` from roughly `40G` to `7.6G`.
- 2026-04-19: lab-only execution isolation proved out. With WAL/pool/PR-monitor/scratch fixes in place, the main remaining `vibe-kanban` trigger was heavy preview/install child workload living in the same service cgroup. In the lab, running Codex executions through transient user units via `systemd-run --user --pipe --service-type=exec` kept the main lab service around `117-222 MB` while the heavy load moved into a separate `vk-lab-codex-*.service`. Stopping the workspace through VK correctly cleaned up the transient unit. This is still lab-only and not ported to prod or `staging`.
- 2026-04-20: ported the proven lab fixes into prod and rolled them out live after a lean backup plus point-in-time DB snapshots. Production now has:
  - SQLite `WAL`
  - lower DB pool (`8`) and real busy timeout
  - `VK_DISABLE_PR_MONITOR` honored
  - scratch create/update emitted directly from the route with `UI_PREFERENCES` write coalescing
  - Codex/script execution isolation via transient `systemd-run --user` services
  - prod wrapper env:
    - `VK_USE_SYSTEMD_RUN=1`
    - `VK_TRANSIENT_MEMORY_HIGH=1500M`
    - `VK_TRANSIENT_MEMORY_MAX=3000M`
- Production validation after rollout:
  - main service restarted cleanly on PID `3663929`
  - PR monitor logged `PR monitor disabled by VK_DISABLE_PR_MONITOR`
  - a real prod no-op Codex execution spawned a separate `vk-exec-codex-*.service`
  - main prod VK stayed about `116-117 MB` during that probe
  - execution completed successfully and the transient unit disappeared cleanly
