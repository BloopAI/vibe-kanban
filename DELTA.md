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

## 2026-04-19T00:00:00Z | vk/53b2-vk-needs-review | app bar needs-review project bubbles

- Intent: show a project-level visual indicator when a project has linked workspaces with agents that have finished or are waiting for review.
- Completed:
  - added project icon bubbles in the left app bar for projects with review-needed workspaces
  - aggregated review-needed state from existing workspace summary signals
  - added local helper APIs for workspace summaries and local project workspace lookup
  - committed the feature as `5c5f83855`
- Files changed:
  - `packages/ui/src/components/AppBar.tsx`
  - `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
  - `packages/web-core/src/shared/lib/api.ts`
  - `STREAM.md`
  - `HANDOFF.md`
- Verified:
  - `git diff --check` passed for the touched frontend files
- Not complete / known gaps:
  - `pnpm run format` could not complete because `prettier` was missing
  - `pnpm run check` could not complete because `tsc` was missing
  - original branch push/PR preview state has since changed; see current branch history and PR state instead of this older branch-note wording

## 2026-04-24T00:00:00Z | vk/7b9a-vk-worktree-clea | immediate post-merge worktree cleanup

- Intent: remove workspace worktree folders as soon as a tracked PR lands in `staging` instead of waiting for the archived-workspace retention window.
- Completed:
  - added a shared container helper that deletes archived worktrees for workspaces with merged tracked PRs targeting `staging`
  - called that helper from both the background PR monitor and the attach-existing-PR route
  - added a retry after archive-script completion so archive scripts can finish before the worktree is removed
  - archived linked local workspaces and cleaned up their worktrees when their issues move into `In Staging`, including bulk issue updates
  - documented the new behavior in `VK_WORKFLOW.md`
- Files changed:
  - `crates/services/src/services/container.rs`
  - `crates/services/src/services/pr_monitor.rs`
  - `crates/local-deployment/src/container.rs`
  - `crates/server/src/routes/local_compat.rs`
  - `crates/server/src/routes/workspaces/pr.rs`
  - `VK_WORKFLOW.md`
  - `STREAM.md`
  - `HANDOFF.md`
- Verified:
  - added unit coverage for the merged-to-`staging` PR detection helper
  - `cargo fmt --all` completed
- Not complete / known gaps:
  - PR `#6` still needs merge
  - backup retention validation was not rerun during the sync cleanup step
  - full test validation was not rerun after the final cleanup behavior adjustments
  - pinned workspaces still keep the existing auto-archive exception
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

## 2026-04-20T00:00:00Z | vk/ea3c-vk-auto-archive | continuity refresh for staging-equivalent worktree

- Intent: resume from the real checked-out workspace state and correct stale branch-local continuity notes.
- Completed:
  - confirmed the checked-out branch is `vk/ea3c-vk-auto-archive`
  - confirmed the worktree is clean and matches `staging` at `88c0ebd59`
  - replaced stale backup-retention stream notes in `STREAM.md` and `HANDOFF.md`
- Verified:
  - `git status --short --branch`
  - `git diff --stat`
  - `git diff --name-only staging...HEAD`
  - `git log --oneline staging..HEAD`
  - `curl -s http://127.0.0.1:4311/api/info` confirmed `shared_api_base: null`
- Not complete / known gaps:
  - `pnpm run format` did not complete because `packages/web-core` could not resolve `prettier`

## 2026-04-26T12:35:00Z | vk/ea3c-vk-auto-archive | Codex rollout continuity repair

- Intent: stop empty or failed Codex rollout launches from poisoning follow-up turns in the local Vibe Kanban install.
- Completed:
  - identified `019dc72a-9fba-7961-9c36-a3f8f8a63036` as a true zero-byte rollout file
  - confirmed `019dc9bd-ef72-76f2-b08e-4c83659f0369` was non-empty despite the late `thread not found` log
  - changed resume lookup to only use completed exit-0 coding-agent turns with a non-empty summary
  - backed up the live DB to `/home/mcp/backups/vk-rollout-repair-20260426T122842Z`
  - cleared four live DB `agent_session_id` pointers whose rollout files were empty or missing
- Verified:
  - `cargo fmt --all`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p db`
  - post-repair live DB scan returned `bad_rollout_agent_session_rows_after 0`
- Not complete / known gaps:
  - the zero-byte rollout cannot be reconstructed because no persisted session content exists
  - the upstream Codex late-finalization `thread not found` log may still appear, but it no longer points at an empty rollout anchor in the live DB

## 2026-04-26T14:55:00Z | vk/ea3c-vk-auto-archive | execution status and vibe.local hotfix

- Intent: stop mounted workspace pages from showing completed agents as still running until manual refresh, and restore `vibe.local` after the local deploy.
- Completed:
  - changed execution-process WebSocket consumers to reconnect after clean closes and reload a fresh process snapshot
  - stopped the execution-process server stream from forwarding unrelated non-patch messages such as `finished`
  - rebuilt `packages/local-web/dist` so the frontend fix is embedded in the local server binary
  - rebuilt and redeployed `/home/mcp/.local/bin/vibe-kanban-serve`
  - restored LAN proxy reachability by setting `HOST=0.0.0.0`, `BACKEND_PORT=4311`, and `PREVIEW_PROXY_PORT=4312` in the user service drop-in
- Verified:
  - `pnpm install`
  - `pnpm run format`
  - `pnpm --filter @vibe/local-web run build`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p services -p db`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - `https://vibe.local` returned `200`
  - execution-process WebSocket returned initial snapshot plus `Ready`
- Not complete / known gaps:
  - no browser-driven long-running agent test was performed; the smoke test covered the stream path and deployed service health

## 2026-04-26T16:05:00Z | vk/ea3c-vk-auto-archive | local-only auth gate hotfix

- Intent: stop local-only Vibe Kanban from showing a remote sign-in prompt in the left nav after service restarts or deploys.
- Completed:
  - traced the regression to `/api/info` returning `login_status: loggedout` while `shared_api_base` was intentionally `null`
  - added the live user-service drop-in `/home/mcp/.config/systemd/user/vibe-kanban.service.d/local-auth.conf` with `VK_DISABLE_AUTH=1`
  - changed local deployment login status so an install with no shared API base reports `LoggedIn { profile: None }`
- Verified:
  - live `/api/info` returned `login_status: loggedin` and `shared_api_base: null` after the service drop-in
  - `https://vibe.local` returned `200` after restart
  - `pnpm run format`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p local-deployment -p server`
  - `pnpm --filter @vibe/local-web run build`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - active workspace summaries showed no `running` execution-process statuses before restart
  - deployed binary hash matched `target/release/server`: `8d348fb20f36bb25d0dc0737aa5ae3df6e8e8c2243003bff6ffc27f2985f6525`
  - post-restart service state was `active/running`
  - post-restart `/api/info` returned `login_status: loggedin` and `shared_api_base: null`
  - post-restart `https://vibe.local` returned `200`
- Not complete / known gaps:
  - local-auth source hardening still needs commit/push/staging promotion

## 2026-04-26T17:20:00Z | vk/ea3c-vk-auto-archive | Codex unforkable rollout fallback

- Intent: stop stale Codex rollout ids from blocking prompts when Codex reports that a stored thread cannot be forked.
- Completed:
  - investigated `019dc44c-03d6-7401-a6f5-52353f438bcf` and confirmed the rollout JSONL existed, but current Codex still rejected it as `no rollout found`
  - backed up the live DB to `/home/mcp/backups/vk-rollout-repair-20260426T-thread019dc44c/db.v2.sqlite`
  - cleared only the live `coding_agent_turns.agent_session_id` pointer for `019dc44c-03d6-7401-a6f5-52353f438bcf`
  - changed Codex prompt and review launch to fall back to `thread/start` when `thread/fork` reports a missing, empty, or unloadable rollout
  - rebuilt and deployed `/home/mcp/.local/bin/vibe-kanban-serve` with SHA-256 `4a87753855846cde85227e582c3fb0fc3fe23b297b5cd5fd74c65b802f81cc6b`
  - restarted `vibe-kanban.service`
- Verified:
  - live DB query returned zero rows for `agent_session_id = 019dc44c-03d6-7401-a6f5-52353f438bcf`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo check -p executors -p server`
  - `pnpm run format`
  - `env DATABASE_URL=sqlite:///home/mcp/.local/share/vibe-kanban/db.v2.sqlite cargo build --release -p server --bin server`
  - deployed binary hash matched `target/release/server`
  - `systemctl --user is-active vibe-kanban.service` returned `active`
  - post-restart `/api/info` returned `login_status: loggedin` and `shared_api_base: null`
  - post-restart `https://vibe.local` returned `200`
- Not complete / known gaps:
  - commit, push, and staging promotion are still pending
