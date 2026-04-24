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

## 2026-04-24T00:00:00Z | vk/6d92-vk-archive-modal | archive-project modal follow-up

- Intent: correct the local-only archive-project UX so archived projects disappear from the left nav and are restored from a dedicated archive modal.
- Completed locally:
  - removed the inline archived-project list from the desktop AppBar project navigation
  - removed the inline archived-project section from the mobile drawer project navigation
  - added a dedicated archive action beneath project creation and wired it to a new archived-project restore modal
  - added restore handling that unarchives the selected local project, refreshes local project queries, and navigates into the restored project
- Files changed:
  - `packages/ui/src/components/AppBar.tsx`
  - `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
  - `packages/web-core/src/shared/dialogs/kanban/ArchivedProjectsDialog.tsx`
- Verified:
  - `cargo fmt --all` completed through `pnpm run format`
- Not complete / known gaps:
  - `pnpm run format` stopped because `prettier` is not installed in this worktree
  - `pnpm --filter @vibe/web-core run check` failed because `tsc` is not installed in this worktree
  - human UI smoke test is still needed before trusting the corrected UX
