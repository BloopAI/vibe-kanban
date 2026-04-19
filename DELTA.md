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
