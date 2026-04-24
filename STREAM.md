# STREAM.md

## Stream Identifier

- Branch: `vk/6d92-vk-archive-modal`
- Repo: `/home/mcp/code/worktrees/cc95-vk-archive-proje/_vibe_kanban_repo`
- Working mode: correct the local-only archived-project UX and ship it through a fresh PR into `staging`
 - Base: `fork/staging`

## Objective

- Remove archived projects from the left-column navigation and restore them through a dedicated archive action that opens a modal.

## In Scope

- Desktop AppBar archive entry point below the create-project button
- Mobile drawer archive entry point for local-only mode
- Archived-project restore modal for local projects
- Continuity docs, commit, push, and PR for the corrected UX

## Out of Scope

- Reworking the project archive data model or server API
- Remote/cloud project behavior
- Unrelated sidebar cleanup

## Stream-Specific Decisions

- Archived projects must not render inline in the left-column project nav.
- The archive affordance should live beneath the `+` project creation control in the project section.
- Restoring an archived local project should immediately unarchive it, refresh cached local project queries, and navigate into that project.
- The previous archive implementation in PR `#3` is considered functionally insufficient for the desired UX and is being superseded with a follow-up PR.

## Relevant Files / Modules

- `packages/ui/src/components/AppBar.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
- `packages/web-core/src/shared/dialogs/kanban/ArchivedProjectsDialog.tsx`

## Current Status

- Confirmed:
  - local archived projects are currently hidden from the active desktop project list but still appear as a secondary archived list in navigation
  - mobile drawer also currently exposes archived projects inline
  - a fresh branch has been created from `fork/staging`
- In progress:
  - replace inline archived navigation with a dedicated archive button and restore modal
- Pending:
  - validation in this worktree
  - commit, push, and open the replacement PR

## Risks / Regression Traps

- The archive action should stay local-only and must not appear to change remote project behavior.
- Restoring a project must invalidate both the project list query and the individual local project query to avoid stale UI.
- The new modal path should not break the existing create-project flow or project reorder handling.

## Next Safe Steps

1. Finish wiring the modal-based archive restore flow and remove inline archived navigation.
2. Run the narrowest relevant validation available in this worktree.
3. Commit, push, and open a new PR into `staging`.
