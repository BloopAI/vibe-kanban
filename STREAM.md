# STREAM.md

## Stream Identifier

- Branch: `vk/cc95-vk-archive-proje`
- Repo: `/home/mcp/code/worktrees/cc95-vk-archive-proje/_vibe_kanban_repo`
- Working mode: local-only VK feature branch

## Objective

- Add local project archive/restore behavior so completed or inactive projects stop expanding the left-column project list forever.

## In Scope

- Local-only runtime stability
- Local issue/project/workspace behavior
- Local project navigation and project settings behavior
- Local archive/restore persistence for projects

## Out of Scope

- Reviving the old cloud-backed board model
- Depending on `api.vibekanban.com` for local board state
- Adding remote/cloud project archiving in this branch

## Stream-Specific Decisions

- `staging` is the base branch; this stream lands through a PR back into `staging`.
- The local install must keep `shared_api_base` disabled.
- The archive flag is persisted in the local `projects` table rather than emulated with scratch-only UI state.
- Archived local projects should be hidden from the primary AppBar/mobile project list but remain restorable from an archived section.

## Relevant Files / Modules

- `crates/db/src/models/project.rs`
- `crates/db/migrations/20260418000000_add_project_archived_flag.sql`
- `crates/server/src/routes/projects.rs`
- `packages/ui/src/components/AppBar.tsx`
- `packages/web-core/src/features/kanban/ui/KanbanContainer.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
- `shared/types.ts`
- local DB: `~/.local/share/vibe-kanban/db.v2.sqlite`

## Current Status

- Confirmed:
  - local projects have a persistent `archived` flag
  - local project settings can archive the current project
  - archived local projects are hidden from the primary left-column project list
  - archived local projects can be restored from an Archived section in the left-column UI
  - shared local TypeScript types were regenerated after the model change
- Pending:
  - push branch, open PR into `staging`, and land it
  - local UI smoke test after dependencies are available in this worktree

## Risks / Regression Traps

- Confusing archived projects with deleted or missing projects
- Repointing the service back to cloud/shared API config
- Forgetting to keep the restore affordance visible when hiding archived projects

## Next Safe Steps

1. Branch new work from `staging`.
2. Keep the local-only runtime intact.
3. Rebase this branch onto the latest `fork/staging` before merge if `staging` moves.
