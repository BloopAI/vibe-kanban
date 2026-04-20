# HANDOFF.md

## What Changed This Session

- Built and used an isolated VK lab instance on `127.0.0.1:4411` with separate state and separate `CODEX_HOME`.
- Confirmed a major backend/DB root-cause direction in the lab:
  - SQLite `DELETE` journaling was a real contributor to the stalls
  - the `VK_DISABLE_PR_MONITOR=1` env var was being ignored in code
  - the unseen-turn query was missing a useful unseen-turn index
- Tested the lab in stages:
  - baseline `DELETE` mode
  - `WAL`
  - `WAL` + lower DB pool + real PR monitor disable
  - then a scratch/event-fanout reduction for scratch create/update
- Verified the strongest gain came from:
  - `WAL`
  - smaller SQLite pool
  - PR monitor actually disabled
- Verified the remaining main hotspot is still `UI_PREFERENCES` scratch upserts.
- Fixed a kanban/workspace loading regression that was driving the local VK server back to multi-GB RSS and eventual hangs.
- The concrete hotfix was:
  - stop aggressive workspace-summary refetching in `packages/web-core/src/shared/hooks/useWorkspaces.ts`
  - stop redundant no-op `UI_PREFERENCES` scratch upserts in `packages/web-core/src/shared/hooks/useUiPreferencesScratch.ts`
- Fixed a second frontend churn path in mounted workspace views:
  - stop default 5-second polling in `packages/web-core/src/shared/hooks/useBranchStatus.ts`
  - stop default 5-second polling in `packages/web-core/src/shared/hooks/useTaskWorkspaces.ts`
- Rebuilt and redeployed the local server binary after the fix, then stress-tested the live service with repeated kanban/workspace traffic.
- Preserved the old divergent canonical `staging` tip on rescue branches.
- Reset the canonical local `staging` checkout to match `fork/staging`.
- Split `ca67946ab` into a clean branch, `vk/ops-backup-retention-20260419`.
- Opened PR `#6` for the backup retention change.
- Updated the branch-local continuity docs so they match the backup retention stream.
- Isolated VK from tmux/interactive Codex auth by moving the service onto its own `CODEX_HOME`:
  - `/home/mcp/.local/share/vibe-kanban/codex-home`
- Copied the existing Codex rollout/session state into that VK-only `CODEX_HOME` after confirming that old workspace threads were failing to fork without the old rollout files.
- Closed the earlier upstream official issue/PR for the first partial fix because it was not complete:
  - `BloopAI/vibe-kanban#3372`
  - `BloopAI/vibe-kanban#3373`

## What Is True Right Now

- The live local install is the source of truth.
- `/api/info` reports `shared_api_base: null`.
- The best current root-cause evidence is now backend/DB-related, not just frontend polling:
  - SQLite `DELETE` mode was materially worse than `WAL`
  - PR monitor disable was not honored before the lab patch
  - the remaining heavy hotspot is still scratch upsert churn
- Two concrete frontend polling regressions are fixed in the live service and in `staging`.
- Current verification after the hotfix:
  - repeated mixed kanban/workspace bursts passed with `0` failures
  - a 2-minute mixed soak (`21,070` requests) passed with `0` failures
  - live service stayed under roughly `90 MB RSS` with `0` swap
- Additional verification after the second workspace-polling hotfix:
  - repeated browser-like workspace-open traffic against `OpsPB::Linking in reports`, `VK:: Wire Ntfy`, and `Vk::Ops` stayed roughly in the `32–51 MB` range
  - no `git inspection timeout`, DB pool timeout, or slow-query churn appeared during that controlled test
- Additional isolated lab verification:
  - baseline mixed workload in `DELETE` mode stalled badly:
    - writes up to `3.5s`
    - summaries up to `3.3s`
    - `git/status` up to `7.0s`
    - `projects` up to `7.5s`
  - after `WAL` + lower pool + PR monitor off:
    - repeated mixed load had `0` failures
    - long soak with repeated `_vibe_kanban_repo` workspace starts had `0` failures
    - memory stayed under about `1.24 GB`
  - after reducing scratch create/update fanout in the lab:
    - short heavy run improved further
    - long soak improved further
    - but scratch writes still occasionally hit `1-2.2s`
- The board/issue data now lives locally in `~/.local/share/vibe-kanban/db.v2.sqlite`.
- The canonical local checkout is back on a clean `staging` that matches `fork/staging`.
- The active branch for this stream is `vk/ops-backup-retention-20260419`.
- PR `#6` is the isolated path for `ops(backups): add tiered lean backup retention`.
- The VK service wrapper exports:
  - `CODEX_HOME=/home/mcp/.local/share/vibe-kanban/codex-home`
- VK must not share `~/.codex/auth.json` with tmux Codex sessions anymore.

## What Is Still Broken

- VK is still not fully root-caused or fully fixed.
- There is at least one remaining failure mode that is not the earlier frontend polling churn:
  - several heavy VK-owned child processes stay attached
  - SQLite starts locking (`database is locked`)
  - `POST /api/workspaces/start` and `POST /api/workspaces/summaries` can return `500`
  - the VK server can still re-bloat into the `9+ GB` range under that load
- This remaining path appears to involve the interaction between:
  - live coding-agent child processes
  - dev-server / preview processes
  - SQLite lock contention
  - VK retaining memory badly once the service is under that pressure
- That remaining bug is now better isolated:
  - the repo-specific trigger is mostly workload type, not raw repo size
  - `vibe-kanban` work tends to start the most stressful preview/dev-server/self-hosting workloads
  - the remaining backend hotspot is scratch write churn, especially `UI_PREFERENCES`
- The lab-only scratch fanout reduction helped, but did not eliminate the remaining slow scratch upserts.

## Known Good Validation

- Git history sync checks passed:
  - canonical `staging` now matches `fork/staging`
  - `vk/ops-backup-retention-20260419` is exactly one commit ahead of `staging`
- Not rerun in this cleanup stream:
  - repo build/test validation for the backup retention change itself

## What The Next Agent Should Do

- Keep further root-cause work in the isolated lab, not prod.
- Treat these as the current best candidate fixes:
  1. switch SQLite handling off `DELETE`
  2. reduce SQLite pool size materially
  3. honor `VK_DISABLE_PR_MONITOR`
  4. add the unseen-turn index
  5. reduce `UI_PREFERENCES` scratch write amplification
- Treat `c6a5dd7d9 fix: stop kanban polling and scratch churn` as the baseline fix for the recent kanban/workspace hang regression.
- Treat `88c0ebd59 fix: stop workspace status polling churn` as the second required frontend fix for the same broad stability stream.
- If VK starts re-bloating again, compare the current behavior against this session’s stress results before assuming it is the same bug.
- Do not reopen an upstream official issue/PR until the remaining heavy-child / DB-lock path is root-caused and fixed.
- Merge PR `#6`.
- Keep the rescue branches until there is no more need to recover anything from the old divergent `staging`.
- After PR `#6` lands, bring the remaining queued PRs to `staging` one at a time.
- Build and use an isolated lab/test instance for further diagnosis instead of continuing to use production VK as the test bed.
- Do not port lab fixes to prod or `staging` without explicit user confirmation.

## What The Next Agent Must Not Do

- Do not re-enable `VK_SHARED_API_BASE` or `VK_SHARED_RELAY_API_BASE` for the local install.
- Do not delete the rescue branches before confirming the divergence cleanup is complete.
- Do not reintroduce direct local-only commits onto the canonical `staging` checkout.
- Do not assume PR `#6` has fresh validation beyond the preserved commit history unless it is rerun explicitly.
- Do not point VK back at `~/.codex` unless you intentionally want VK and tmux Codex sessions to share refresh-token rotation again.
- Do not copy only `auth.json` into a fresh VK `CODEX_HOME`; old workspace thread fork/resume needs the Codex rollout/session state too.
- Do not touch tmux or interactive Codex sessions while diagnosing VK service failures.
- Do not claim the issue is fully fixed just because raw endpoint stress tests pass; the earlier miss came from not reproducing mounted browser/UI polling and live child-process load together.

## Verification Required Before Further Changes

- `curl -s http://127.0.0.1:4311/api/info` and confirm `shared_api_base` is `null`
- if continuing lab DB work, capture before/after timings for:
  - scratch writes
  - `/api/workspaces/summaries`
  - `/api/workspaces/:id/git/status`
  - `/api/projects`
  - `_vibe_kanban_repo` workspace starts
- `git status --short --branch`
- Task-specific validation for backup retention behavior if the change is modified further
- `systemctl --user show vibe-kanban.service -p ExecStart -p Environment`
- `tr '\\0' '\\n' < /proc/$(systemctl --user show -p MainPID --value vibe-kanban.service)/environ | rg '^CODEX_HOME='`
- If prod VK wedges while you need the board back quickly:
  - back up `db.v2.sqlite`
  - restart `vibe-kanban.service`
  - if it gets stuck in `deactivating (stop-sigterm)`, wait briefly for normal cleanup
  - if it still does not exit, force-kill only the stuck VK main PID and let systemd bring it back
  - do not kill tmux or unrelated Codex sessions

## Verification Status From This Session

- canonical `staging` sync cleanup completed
- PR `#6` exists for the isolated backup retention commit
- branch-local docs now match the backup retention stream
- the second workspace-polling fix is committed to `staging`
- prod VK recovery by forced service-main-PID kill was used successfully when the service got stuck in `stop-sigterm`
- isolated lab findings now show real backend improvement from `WAL`/pool/PR-monitor changes, but not a full fix

## Session Metadata

- Branch: `vk/ops-backup-retention-20260419`
- Repo: `/home/mcp/_vibe_kanban_repo`
- Focus: canonical staging sync cleanup, isolated backup retention PR, and continued VK stability diagnosis
Latest lab conclusion:

- We now have two separate root-cause areas, and both are real:
  1. DB/scratch/backend pressure inside VK
  2. heavy preview/install child workload sharing the same service cgroup
- Lab-only fixes for (1) have shown major improvement.
- A lab-only transient-unit prototype for (2) also worked:
  - heavy `vibe-kanban` preview/install work no longer inflated the main VK lab service
  - the load moved into transient `vk-lab-codex-*.service` units
  - VK stop/cleanup successfully removed those units

Important:

- This isolation work is still lab-only.
- Nothing from the lab should be ported to prod or `staging` without explicit user confirmation.

Current production baseline:

- The user later explicitly approved porting the proven lab fixes to production.
- Prod now uses the DB/scratch fixes plus transient execution isolation.
- Heavy Codex/script child work should now land in separate `vk-exec-*.service` transient units instead of inflating the main `vibe-kanban.service` cgroup directly.
- The prod wrapper now exports:
  - `VK_USE_SYSTEMD_RUN=1`
  - `VK_TRANSIENT_MEMORY_HIGH=1500M`
  - `VK_TRANSIENT_MEMORY_MAX=3000M`

If prod degrades again:

1. check whether main `vibe-kanban.service` memory is growing, or only a transient `vk-exec-*` unit
2. check whether scratch writes / DB locks are back, or whether the problem is now isolated to a transient child unit
3. preserve DB first, then inspect transient units before restarting the main service
