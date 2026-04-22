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
- The canonical VK source repo is:
  - `/home/mcp/_vibe_kanban_repo`
- The live service does not run directly from the repo checkout.
- Production runs through:
  - wrapper: `/home/mcp/.local/bin/vibe-kanban-serve`
  - binary: `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
- VK workspaces/worktrees live under:
  - `/home/mcp/code/worktrees/...`
- Those worktree paths are not the canonical product repo.
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
- Current path/deploy map is documented in:
  - `VK_WORKFLOW.md`
  - `LIVE_DEPLOYMENT.json`

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

- Start from:
  - `/home/mcp/_vibe_kanban_repo`
- Read first:
  - `HANDOFF.md`
  - `STATE.md`
  - `DELTA.md`
  - `VK_WORKFLOW.md`
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

- Do not treat `/home/mcp/code/worktrees/...` as the canonical VK repo unless the task is explicitly about a specific workspace/worktree.
- Do not invent or assume a `/home/mcp/code/vibe-kanban` checkout.
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
 - Workflow map: `VK_WORKFLOW.md`
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

Open workspace send-state note:

- 2026-04-20: follow-up prompts in an already-open workspace could succeed server-side while the UI still looked idle until the workspace view remounted.
- Fix now live:
  - a websocket reconnect fix landed in `packages/web-core/src/shared/hooks/useJsonPatchWsStream.ts`
  - an additional session refresh/remount mitigation is live via:
    - `packages/web-core/src/features/workspace-chat/model/hooks/useSessionSend.ts`
    - `packages/web-core/src/pages/workspaces/WorkspacesMainContainer.tsx`
    - `packages/web-core/src/pages/kanban/ProjectRightSidebarContainer.tsx`
    - `packages/web-core/src/shared/lib/sessionStreamRefresh.ts`

## 2026-04-21 Current Handoff

- Immediate auth breakage in prod VK was repaired by resyncing the isolated VK auth store:
  - source: `/home/mcp/.codex/auth.json`
  - target: `/home/mcp/.local/share/vibe-kanban/codex-home/auth.json`
- Verification after the resync:
  - `CODEX_HOME=/home/mcp/.local/share/vibe-kanban/codex-home codex login status` returned logged-in
  - a real VK follow-up on `VC::ops Playbook` completed with summary `auth-path-ok`
- Important nuance:
  - this repaired the stale auth file
  - it did not eliminate the underlying concurrency risk from multiple VK-owned Codex workers sharing one ChatGPT token family

- Stale visible auth/bubblewrap errors were not only in failed execution rows.
- The larger source was stored process transcript files under:
  - `/home/mcp/.local/share/vibe-kanban/sessions/.../processes/*.jsonl`
- Remediation performed:
  - deleted stale empty failed/killed codingagent rows from `db.v2.sqlite`
  - restored process logs after an over-broad orphan cleanup attempt
  - sanitized process log files in place to remove only stale auth/bubblewrap noise
- Sanitization result:
  - `513` process log files touched
  - `8698` stale lines removed
  - removed patterns included:
    - `bubblewrap`
    - `user namespaces`
    - `Failed to refresh token`
    - `refresh_token_reused`
    - `token_expired`
- Example verified:
  - `VC:: Build` workspace/session:
    - workspace id: `458c9eb5-0127-4439-8952-4dc0c64e4f66`
    - session id: `bf133b52-0de2-424b-8dae-a933b57668cc`
  - the stale auth/bubblewrap lines were in process log:
    - `59d6a63b-33bc-4bfd-95a6-9a84103f3377.jsonl`
  - that file no longer contains those stale auth/bubblewrap lines

- `VC::ops Playbook` was unlinked from its issue and was repaired:
  - workspace id: `0b00ce25-fb2b-4742-b310-4bf6aaa1e7e7`
  - linked task id: `69a9dbf6-2cb9-48f2-8d9f-d160fe7a5107`

- New-workspace visibility was patched in:
  - `packages/web-core/src/shared/hooks/useCreateWorkspace.ts`
- This is intended to make new issue-linked workspaces appear under Issues without leaving and reopening the issue.

- Current unresolved problem:
  - the old chat-side remount workaround has been removed
  - the real root cause was backend-side: follow-up sends created the new `execution_process` row immediately, but the session execution-process websocket was not surfacing the first add promptly enough for the open workspace
- Current chat/live-update fix now live:
  - `crates/server/src/routes/sessions/mod.rs`
    - after successful follow-up spawn, VK now immediately pushes:
      - `execution_process_patch::add(&execution_process)`
      - `workspace_patch::replace(&workspace_with_status)`
    - this restores prompt-send visibility through the normal live event stream instead of waiting on a later refresh
  - removed the client-side forced refresh/remount workaround from:
    - `packages/web-core/src/features/workspace-chat/model/hooks/useSessionSend.ts`
    - `packages/web-core/src/pages/workspaces/WorkspacesMainContainer.tsx`
    - `packages/web-core/src/pages/kanban/ProjectRightSidebarContainer.tsx`
  - deleted:
    - `packages/web-core/src/shared/lib/sessionStreamRefresh.ts`
- Current remaining chat risk:
  - if the chat still feels stale after this fix, the next agent should inspect the session execution-process websocket path first, not add more UI remount logic
- Relevant files for future chat tracing:
  - `crates/server/src/routes/sessions/mod.rs`
  - `crates/server/src/routes/execution_processes.rs`
  - `crates/services/src/services/events/streams.rs`
  - `packages/web-core/src/shared/hooks/useExecutionProcesses.ts`
  - `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts`
  - `packages/web-core/src/shared/hooks/useJsonPatchWsStream.ts`

- Additional workspace relink completed:
  - `FR:: Garmin Sync Down`
  - workspace id: `25e19656-bc9f-4315-9712-a1d5468bdc00`
  - linked task id: `7d046622-1dd5-4025-bf04-fe2bfebd10a3`

- Recent backups relevant to this stream:
  - `/home/mcp/backups/vk-workspace-visibility-rollout-20260421T091514Z`
  - `/home/mcp/backups/vk-workspace-live-refresh-fix-20260421T094438Z`
  - `/home/mcp/backups/vk-orphan-process-log-cleanup-20260421T100138Z`
  - `/home/mcp/backups/vk-sanitize-stale-process-errors-20260421T100315Z`
  - `/home/mcp/backups/vk-remove-final-orphan-20260421T100416Z`
  - `/home/mcp/backups/vk-chat-live-refresh-rollout-20260421T100956Z`
  - `/home/mcp/backups/vk-vc-ops-playbook-relink-20260421T102339Z`
  - `/home/mcp/backups/vk-chat-root-fix-20260421T104346Z`
  - `/home/mcp/backups/vk-fr-garmin-relink-20260421T110337Z`

Codex follow-up recovery note, 2026-04-20:

- The `no rollout found for thread id ...` failures were not caused by missing backup data alone.
- The real production bug was in transient execution env propagation:
  - with `VK_USE_SYSTEMD_RUN=1`, VK launched Codex app-server in transient user units
  - those transient units were missing inherited wrapper env, especially `CODEX_HOME`
  - app-server therefore looked in `~/.codex` instead of `/home/mcp/.local/share/vibe-kanban/codex-home`
  - result: follow-up fork failed even though the rollout files and thread metadata existed
- Direct `codex fork` with `CODEX_HOME=/home/mcp/.local/share/vibe-kanban/codex-home` was the proof: it succeeded against the same thread ids that VK app-server was rejecting.
- Production fix now live:
  - transient Codex units inherit `PATH`, `HOME`, `CODEX_HOME`, `SHELL`, `BASH_ENV`, and `VK_CODEX_BASE_COMMAND`
  - Codex executor base command is configurable through `VK_CODEX_BASE_COMMAND`
  - live wrapper exports:
    - `VK_CODEX_BASE_COMMAND=/home/mcp/.local/bin/codex`
- Also hardened:
  - Codex follow-up fork now uses a minimal `ThreadForkParams` instead of copying the full `ThreadStartParams` into `thread/fork`
- Result:
  - the previously interrupted sessions resumed and stayed `running` again without fresh `no rollout found` errors

If prod degrades again:

1. check whether main `vibe-kanban.service` memory is growing, or only a transient `vk-exec-*` unit
2. check whether scratch writes / DB locks are back, or whether the problem is now isolated to a transient child unit
3. preserve DB first, then inspect transient units before restarting the main service
- If VK starts logging:
  - `Codex's Linux sandbox uses bubblewrap and needs access to create user namespaces.`
- check these host settings first:
  - `/proc/sys/kernel/unprivileged_userns_clone`
  - `/proc/sys/kernel/apparmor_restrict_unprivileged_userns`
- On this MCP host, AppArmor currently blocks unprivileged user namespaces even though `unprivileged_userns_clone=1`.
- Direct repro:
  - `unshare -Ur true`
  - `bwrap --ro-bind / / --proc /proc --dev /dev true`
- VK now mitigates this in `crates/executors/src/executors/codex.rs` by forcing Codex sandbox mode to `danger-full-access` when `apparmor_restrict_unprivileged_userns=1`.
- Optional override:
  - `VK_ASSUME_USERNS_BLOCKED=1` to force the mitigation
  - `VK_ASSUME_USERNS_BLOCKED=0` to disable it

2026-04-21 residual red-chat follow-up note:

- The user still saw red bubblewrap-style errors in chats even after the earlier transcript cleanup.
- Fresh evidence:
  - live process logs on `2026-04-21` still contained:
    - `Codex's Linux sandbox uses bubblewrap and needs access to create user namespaces.`
  - example sessions:
    - `VC::ops Playbook`
      - session id `e73f8d43-be83-4714-a108-d120537e6691`
    - `VC:: Build`
      - session id `bf133b52-0de2-424b-8dae-a933b57668cc`
- Root cause was two-part:
  1. legacy follow-up forks were still effectively carrying old `workspaceWrite` sandbox settings into Codex app-server on resumed threads
  2. the Codex log normalizer treated warning/configWarning events as red `error_message` rows instead of neutral system messages
- Production repair now deployed:
  - rebuilt `/home/mcp/_vibe_kanban_repo/target/release/server`
  - rolled binary to:
    - `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
    - sha256 `47c15955156cddb47252823c110859c8450eb0767a9d19933322dded5c99bf6b`
  - restarted:
    - `vibe-kanban.service`
- Code changes relevant to this residual chat-noise fix:
  - `crates/executors/src/executors/codex.rs`
    - follow-up fork request now explicitly overrides forked thread config so stale legacy sandbox settings are not inherited
    - host userns/AppArmor mitigation remains in place
  - `crates/executors/src/executors/codex/normalize_logs.rs`
    - `configWarning` and warning events now normalize to `SystemMessage`
    - duplicate bubblewrap stderr line is suppressed
- Post-rollout cleanup:
  - rewrote `13` process log files under:
    - `/home/mcp/.local/share/vibe-kanban/sessions/.../processes/*.jsonl`
  - removed `26` fresh bubblewrap warning lines that were still replaying into chat history
  - direct `rg` check after cleanup returned no remaining matches for that exact bubblewrap warning string in stored process logs
- Validation run for this repair:
  - `cargo test -p executors renders_warning_events_as_system_messages`
  - `cargo test -p executors suppresses_duplicate_bubblewrap_stderr_warning`
  - `cargo check -p executors -p server`
  - `pnpm run format`
  - `cargo build --release --bin server`
  - `systemctl --user restart vibe-kanban.service`
  - `curl -s http://127.0.0.1:4311/api/info`

2026-04-21 chat-behavior follow-up:

- The remaining chat problem was not just stale websocket state.
- Three concrete UI-side faults were addressed in `staging`:
  1. local pending-send acknowledgment logic kept the composer and status in a fake in-between state after the server had already accepted the follow-up
  2. `useConversationHistory` could miss new turns that arrived already completed, because they skipped the running-state path and never got loaded into the displayed timeline
  3. bottom-lock correction only reran on row-count / virtualizer-size changes, so streaming growth inside the unvirtualized tail could leave the viewport stuck above the real bottom
- Current fix set:
  - `packages/web-core/src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`
    - remove pending follow-up acknowledgment state
    - clear the editor immediately after a successful follow-up POST
  - `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts`
    - detect newly added already-completed processes and load their historic entries immediately
    - update completed processes even when the final stored entry list is empty
  - `packages/web-core/src/features/workspace-chat/model/useConversationVirtualizer.ts`
    - refresh bottom-lock correction on every timeline content update
    - release bottom lock based on leaving the near-bottom region, not only upward-scroll delta heuristics
  - `packages/web-core/src/features/workspace-chat/ui/ConversationListContainer.tsx`
    - pass the conversation content version through to the virtualizer
- Targeted validation passed:
  - `pnpm --filter @vibe/local-web run check`
  - `pnpm --filter @vibe/web-core run check`
  - `pnpm --filter @vibe/ui run check`
  - `pnpm run format`
- Repo-wide validation is still environment-blocked here:
  - `pnpm run check`
  - `pnpm run lint`
  - both fail during backend Rust compilation because `pkg-config` cannot find system `glib-2.0`

2026-04-21 chat stream root cause confirmed and deployed:

- The stuck-chat symptom was confirmed in the live service journal, not just inferred:
  - repeated lines like `MsgStore broadcast lagged ... messages dropped for this subscriber`
- Why that matters:
  - running chat/process log streams are incremental JSON-patch streams
  - once messages are silently dropped, the client can no longer reconstruct the turn correctly
  - reopening the app works because it reconnects and replays history from scratch
- Current repair:
  - `crates/utils/src/msg_store.rs`
    - added `history_plus_stream_strict()`
    - broadcast lag now becomes a stream error for patch-stream consumers
  - `crates/services/src/services/container.rs`
    - running raw/normalized process log websocket streams now use the strict mode so lagged subscribers fail closed instead of drifting stale
  - `packages/web-core/src/shared/lib/streamJsonPatchEntries.ts`
    - unexpected websocket close/error now triggers reconnect with replay-state reset and rebuild
- Validation for this repair:
  - `pnpm --filter @vibe/web-core run check`
  - `cargo check -p utils -p services -p server`
  - `cargo test -p utils --lib msg_store`
  - `pnpm --filter @vibe/local-web run build`
  - `cargo build --release --bin server`
  - deployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service`
  - `curl -s http://127.0.0.1:4311/api/info`
- Current live binary sha256:
  - `946a4211438d532614a7055672c2fa25c710312b9b38923abf812fbb602bc964`

2026-04-21 frontend 404 follow-up:

- After the chat-stream redeploy, the live service could answer `/api/info` but returned `404 Not Found` at `/`.
- Root cause was build invalidation, not routing logic:
  - `crates/server/src/routes/frontend.rs` and the router were correct
  - the real problem was `crates/server/build.rs` not tracking `packages/local-web/dist`
  - after `pnpm --filter @vibe/local-web run build`, Cargo could still reuse a stale server build that did not contain the current embedded frontend assets
- Repair now landed in source:
  - `crates/server/build.rs`
    - recursively emits `cargo:rerun-if-changed` for `packages/local-web/dist`
- Repair now deployed:
  - rebuilt `target/release/server`
  - redeployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service`
  - live sha256 now `a6d17ed54f8ceba064928404ab2af055ae00d855e5bd889e193df265ef6b45b3`
- Live verification after redeploy:
  - `curl -i http://127.0.0.1:4311/` returns `200 OK` with `index.html`
  - `curl -i http://127.0.0.1:4311/assets/index-DWkKdBPw.js` returns `200 OK`
  - `curl -s http://127.0.0.1:4311/api/info` still returns healthy config JSON

2026-04-21 chat history load follow-up:

- After the 404 fix, the next live failure was “chats aren’t loading”.
- Root cause was not session selection or the session execution-process stream:
  - `/api/sessions?workspace_id=...` returned valid sessions
  - `/api/execution-processes/stream/session/ws?...` returned initial snapshot + `Ready`
  - the stuck path was the historic normalized log websocket for finished coding-agent processes
- Verified failure before fix:
  - raw log replay for execution process `ac4680a0-2573-4a78-b71d-8a879caf56b8` returned data
  - normalized replay for the same process opened but emitted nothing and timed out
- Actual backend cause:
  - `crates/services/src/services/container.rs`
  - finished-process normalized replay used a temp `MsgStore` with a history-plus-live subscription model
  - final normalized `JsonPatch` / `Ready` messages could race between history snapshot capture and broadcast receiver subscription
  - when the race lost, the websocket stayed open with no replayed entries, so the chat UI looked blank/loading forever
- Repair now landed and deployed:
  - finished-process normalized replay now awaits normalization, deduplicates the resulting patch history in-memory, and serves a finite replay stream
  - running-process replay path is unchanged
- Live verification after redeploy:
  - normalized replay for `ac4680a0-2573-4a78-b71d-8a879caf56b8` now returns normalized entries immediately
  - `/api/info` returns `200`
  - live sha256 now `e0b3704dcce3f4cf70031141b85c5e2fea0169a6f0d6e0daf458f0fc3656f461`
- Operational note:
  - `systemctl --user restart vibe-kanban.service` got stuck in `deactivating (stop-sigterm)` again during rollout
  - recovered using the documented path by killing only the stuck main PID `2225915`, after which systemd restarted the service cleanly

2026-04-21 Garmin historic replay follow-up:

- The earlier finished-process replay fix was still not enough for `FR:: Garmin Sync Down`.
- Exact failing workspace/session:
  - workspace id `25e19656-bc9f-4315-9712-a1d5468bdc00`
  - session id `3a014c6c-4d98-409f-87d9-1a7f111644c0`
- Exact failing process:
  - `123302ac-b1d5-4587-90b6-5d3bba2d712e`
  - persisted transcript file:
    - `/home/mcp/.local/share/vibe-kanban/sessions/3a/3a014c6c-4d98-409f-87d9-1a7f111644c0/processes/123302ac-b1d5-4587-90b6-5d3bba2d712e.jsonl`
    - `31,667` lines
    - `83,902,430` bytes
  - file validity:
    - valid JSONL
    - only raw `Stdout` / `Stderr` records, no persisted `JsonPatch` rows
- Actual remaining root cause:
  - historical replay still loaded large finished transcripts monolithically before sending the first websocket message
  - `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts` still treated historic replay as all-or-nothing, so one slow recent process could blank the entire conversation during initial load
- Current repair now landed and deployed:
  - `crates/utils/src/execution_logs.rs`
    - added streaming file reads for persisted process logs
  - `crates/services/src/services/execution_process.rs`
    - historical raw replay now streams parsed `LogMsg` values incrementally from disk
  - `crates/services/src/services/container.rs`
    - finished normalized replay now feeds persisted raw logs into the normalizer incrementally and streams patches as they are produced
    - removed `ensure_container_exists()` from historical normalization so chat replay does not recreate worktrees or trigger git inspection
  - `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts`
    - initial/newly-completed/reloaded history now paints partial historic replay while a process is still loading
- Live validation after redeploy:
  - `/api/execution-processes/123302ac-b1d5-4587-90b6-5d3bba2d712e/raw-logs/ws`
    - first replay patch in about `67 ms`
  - `/api/execution-processes/123302ac-b1d5-4587-90b6-5d3bba2d712e/normalized-logs/ws`
    - first normalized replay patch in about `61 ms`
  - `curl -I http://127.0.0.1:4311/`
    - `200 OK`
  - `curl -s http://127.0.0.1:4311/api/info`
    - healthy
- Rollout:
  - rebuilt `packages/local-web/dist`
  - rebuilt `target/release/server`
  - redeployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service` cleanly
  - live sha256 now `2288ec455166a1057c7567763555e3545bd71f87892942aec46ea149f6f961e4`

2026-04-21 attachment/workspace-create slowdown follow-up:

- User reported three live symptoms together:
  - VK felt extremely slow
  - attachment insertion errored from the UI
  - creating a new workspace showed `failed to fetch`
- Verified live narrowing before fix:
  - direct `POST /api/workspaces` already succeeded, so workspace creation was degraded by live server saturation rather than missing route wiring
  - direct global `POST /api/attachments/upload` failed with backend `500`
  - journal showed `UNIQUE constraint failed: attachments.hash`
  - journal also showed repeated slow query bursts and slow pool acquires around workspace summaries
- Fixes now landed and deployed:
  - `crates/services/src/services/file.rs`
    - duplicate attachment hash insert collisions now fall back to `find_by_hash` and return the existing attachment instead of failing the request
  - `crates/server/src/routes/workspaces/workspace_summary.rs`
    - added a small `2s` cache keyed by `archived` to reduce identical summary storms against SQLite
- Validation after redeploy:
  - `cargo check -p services -p server`
  - `cargo build --release --bin server`
  - `pnpm run format`
  - `curl http://127.0.0.1:4311/api/info`
    - `200` in about `9 ms`
  - `POST /api/workspaces`
    - `200` in about `8 ms`
  - duplicate `POST /api/attachments/upload` with the same file payload
    - first call `200` in about `5 ms`
    - second call `200` in about `2 ms`
    - second call returned the same attachment id, confirming dedupe reuse instead of `500`
- Rollout notes:
  - copied new server binary into `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - `systemctl --user restart vibe-kanban.service` hung in `deactivating` again
  - systemd eventually killed old PID `2388147` with `SIGKILL` and started new main PID `2444957`
  - live sha256 now `719712f0cc78503eb9d04908f4d9480d9cb11fb820294995138ed62e66a6083b`

2026-04-21 chat reset / first-screen attachment follow-up:

- User then reported two residual UI problems:
  - agent messages could finish without the chat ending cleanly, leaving the composer blocked
  - after a delay, the chat pane could reset to the empty-state copy:
    - `Your workspace conversation will appear here once a new turn starts.`
  - attachment insertion still failed from the initial workspace screen even though it worked from the second screen
- Actual frontend causes identified in code:
  - `packages/web-core/src/shared/hooks/useWorkspaceSessions.ts`
    - follow-up-related session refreshes could replace or clear the current selection even when the selected session still existed
    - once selection dropped, `ConversationListContainer.tsx` showed the empty-state string above
  - `packages/web-core/src/features/workspace-chat/model/hooks/useSessionSend.ts`
    - existing-session follow-ups were invalidating the workspace session list unnecessarily
  - `packages/ui/src/components/attachment-node.tsx` and `packages/ui/src/components/image-node.tsx`
    - the editor nodes still used raw `/api/...` paths for attachment metadata and proxy URLs instead of host-scoped paths
- Repair now landed:
  - `packages/web-core/src/shared/hooks/useWorkspaceSessions.ts`
    - preserve the current existing-session selection in the same workspace when it still exists
    - only clear selection on empty results when the workspace actually changed
  - `packages/web-core/src/features/workspace-chat/model/hooks/useSessionSend.ts`
    - removed workspace-session invalidation on follow-up send
  - `packages/ui/src/components/WorkspaceContext.tsx`
    - added `HostIdContext` and `scopeLocalApiPath(...)`
  - `packages/web-core/src/shared/components/WYSIWYGEditor.tsx`
    - now passes host id into UI editor-node context
  - `packages/ui/src/components/attachment-node.tsx`
  - `packages/ui/src/components/image-node.tsx`
    - host-scope local attachment metadata/proxy/file URLs consistently
- Validation completed:
  - `pnpm --filter @vibe/web-core run check`
  - `pnpm --filter @vibe/ui run check`
  - `pnpm --filter @vibe/local-web run build`
  - `cargo build --release --bin server`
  - `pnpm run format`
  - `curl -s http://127.0.0.1:4311/api/info`
  - `curl -sI http://127.0.0.1:4311/`
  - `sha256sum /proc/$(systemctl --user show -p MainPID --value vibe-kanban.service)/exe /home/mcp/.local/bin/vibe-kanban-server-cleanfix`
- Live state now:
  - `vibe-kanban.service` is active
  - the running process matches deployed binary sha `8b3b3f9e72dc37f99df018e88fa8f321cfd65b7df7b72b1136426f62832e15af`
- Still not directly UI-verified in the desktop session:
  - reopening the affected chat and confirming it no longer falls back to the empty state after a completed turn
  - retrying attachment insertion from the initial workspace screen

2026-04-22 chat live-update follow-up:

- User reported that `FR:: Coaches Feature Stream` started streaming a few thought/log lines and then stopped updating while the blinking thinking indicator remained.
- Exact live workspace chain:
  - workspace id `fcd0ec67-a0fe-42a8-9337-ef3228ceee80`
  - session id `a97647d3-6d95-4470-a320-fe6bf415edd8`
  - process id `b20d10a2-bf5b-43c2-97ef-ac1186664201`
  - DB state showed the process completed at `2026-04-22T11:40:54Z`
- Important live evidence:
  - the journal showed repeated `MsgStore broadcast lagged ... messages dropped for this subscriber` bursts at `2026-04-22T11:40:49Z` while that workspace was active
  - this strongly indicated the UI was stuck on stale stream state rather than the agent still truly running
- Actual remaining backend cause:
  - `crates/services/src/services/events/streams.rs` still used raw `BroadcastStream` subscriptions for session/workspace/scratch event websockets
  - those paths silently swallowed lagged broadcast errors instead of failing and letting the client reconnect
  - the result was that the session execution-process websocket could miss the completion/update patch and leave the chat UI stuck in stale `running`
- Repair now landed and deployed:
  - `crates/services/src/services/events/streams.rs`
    - convert `BroadcastStreamRecvError::Lagged(n)` into an `io::Error`
    - applies to:
      - `stream_execution_processes_for_session_raw`
      - `stream_scratch_raw`
      - `stream_workspaces_raw`
    - intent is fail-closed + reconnect instead of silent stale state
- Validation completed:
  - `cargo check -p services -p server`
  - `cargo build --release --bin server`
  - deployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service`
  - verified:
    - `curl -sf http://127.0.0.1:4311/api/info`
    - active PID executable path is `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
    - running PID sha matches deployed file sha `9ad30eadb01eb7a357493a6232ffdddc3c212d32d8ae2dd050ff35ec742acad2`
- Operational note:
  - the first post-build restart raced the file replacement and briefly relaunched the deleted old inode
  - the second clean restart after the rename picked up the new binary correctly
- Still needs real UI confirmation:
  - reopen `FR:: Coaches Feature Stream`
  - confirm the chat continues to stream until completion instead of freezing on thinking state

2026-04-22 issue/workspace relink follow-up:

- User reported that three new local issues were not linked to the workspaces created for them.
- Verified broken live pairs before repair:
  - task `af85bbe0-7c78-46ea-b0ec-91476596850c` (`FR:: Coaches Feature Stream `)
    - workspace `fcd0ec67-a0fe-42a8-9337-ef3228ceee80`
    - workspace had `task_id = null`
  - task `6bc54000-384e-4164-8995-b1c5a7d2469b` (`FR::Investigate today's active burn calories`)
    - workspace `ff6bfbf1-8f71-4787-9e92-df7910c0928f`
    - workspace had `task_id = null`
  - task `f0933141-23fd-4a0e-89d3-5d2202325cea` (`FR::Investigate today's active burn calories`)
    - workspace `e9c522ad-a455-42c7-9a4d-74ed6bf8ee98`
    - workspace had `task_id = null`
- Root cause now addressed in code:
  - `packages/web-core/src/shared/components/CreateChatBoxContainer.tsx`
    - added `forcedLinkedIssue` so submit can use an explicit issue/project from route context instead of relying only on create-mode draft state
  - `packages/web-core/src/pages/kanban/ProjectRightSidebarContainer.tsx`
    - issue-route workspace-create panel now passes the current route issue/project directly into `CreateChatBoxContainer`
  - `crates/server/src/routes/workspaces/create.rs`
    - added bounded retry for local task resolution during create-and-start when `linked_issue` is present but the first lookup misses
- Why this matters:
  - this covers both failure modes seen in practice:
    1. route-linked issue context getting lost before submit
    2. newly created local issues not yet resolving on the first backend lookup
- Live repairs already performed:
  - linked `fcd0ec67-a0fe-42a8-9337-ef3228ceee80` -> `af85bbe0-7c78-46ea-b0ec-91476596850c`
  - linked `ff6bfbf1-8f71-4787-9e92-df7910c0928f` -> `6bc54000-384e-4164-8995-b1c5a7d2469b`
  - linked `e9c522ad-a455-42c7-9a4d-74ed6bf8ee98` -> `f0933141-23fd-4a0e-89d3-5d2202325cea`
- Validation completed:
  - `cargo check -p server -p services`
  - `pnpm --filter @vibe/web-core run check`
  - `pnpm --filter @vibe/local-web run build`
  - `cargo build --release --bin server`
  - redeployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service`
  - verified running PID sha matches deployed binary sha `ebbdb9041fd2b6f517606005b53bca8ff1980f68553c1fa9135169b5dc6395cc`
- Operational note:
  - the first restart after replace again came up on the deleted old inode
  - a second clean restart after the rename picked up the new binary correctly
- Still needs real UI confirmation:
  - create one new workspace from an issue route and confirm it appears linked immediately
  - then continue retesting the chat stream behavior in `FR:: Coaches Feature Stream`

2026-04-22 chat streaming follow-up:

- User reported that the orchestration workspace under `FR:: Coaches Feature Stream` would briefly stream a few lines and then appear stuck/busy.
- Exact live chain investigated:
  - workspace `679c24ec-7368-4a08-8f82-931f8d0ea896`
  - session `65c4bde9-df70-4e12-91fd-210c41e7aa3a`
  - latest process `d928142b-d587-4a16-9e23-013d1a6df622`
  - DB showed that latest process was already `completed` at `2026-04-22T12:39:44Z`
- Actual remaining root cause:
  - the normalized logs websocket was replaying a pathological stream of repeated `replace` patches for the same entry path while the response text grew
  - live probe before fix on `/api/execution-processes/d928142b-d587-4a16-9e23-013d1a6df622/normalized-logs/ws` saw about `3872` patch messages and `~5.07 GB` of websocket JSON in `20s`, dominated by `/entries/5`
- Repair now landed and deployed:
  - `crates/server/src/routes/execution_processes.rs`
    - batch normalized websocket patches in `50ms` windows
    - coalesce repeated ops by path so only the latest write in the window is sent
    - includes unit tests for the coalescing helper
  - `crates/server/Cargo.toml`
    - added direct `json-patch` dependency for the new server-side batching logic
- Validation completed:
  - `cargo test -p server coalesce_patch_ops -- --nocapture`
  - `cargo check -p server -p services`
  - `cargo build --release --bin server`
  - `pnpm run format`
  - deployed `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
  - restarted `vibe-kanban.service`
  - verified live sha `4a5e3356b9c7dc4dff3b5e82d5e451ce58d789d8db48420bbe207517d2e70ba4`
  - repeated the same normalized-log websocket probe after deploy and saw about `60` patch messages, `128` patch ops, and `~109.6 MB` total JSON, with `finished` received in about `16.1s`
- Still needs real UI confirmation:
  - reopen the orchestration workspace in `FR:: Coaches Feature Stream`
  - confirm the live chat continues updating instead of freezing after a couple of lines
