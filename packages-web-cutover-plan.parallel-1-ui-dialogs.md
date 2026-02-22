# `@vibe/web` Parallel Plan Track 1: UI Surface + Dialog Consolidation

## Goal

Finish UI-surface migration work while keeping behavior stable and preserving
compatibility shims.

## Branch

- Recommended: `parallel/track-1-ui-dialogs`

## Exclusive Ownership (This Track)

- `packages/web/src/components/ui-new/actions/**`
- `packages/web/src/components/ui-new/dialogs/**`
- `packages/web/src/components/dialogs/**`
- `packages/web/src/features/command-bar/**`
- `packages/web/src/features/settings/**`
- `packages/web/src/shared/ui/dialogs/**`

## Do Not Modify In This Track

- `packages/web/src/hooks/**`
- `packages/web/src/contexts/**`
- `packages/web/src/stores/**`
- `packages/web/src/lib/**`
- `packages/web/src/utils/**`
- `packages/web/src/i18n/**`
- `packages/web/src/keyboard/**`
- `packages/web/src/vscode/**`
- `packages-web-cutover-plan.parallel-2-model.md`
- `packages-web-cutover-plan.parallel-3-shared-integrations.md`

## Work Packages

- [ ] `T1.1` Decompose `src/components/ui-new/actions/index.ts` hotspot.
- [ ] `T1.2` Move action definitions into feature-owned modules and shared
      primitives where appropriate.
- [ ] `T1.3` Keep `src/components/ui-new/actions/index.ts` as compatibility
      re-export facade.
- [ ] `T1.4` Consolidate dialog placement:
      feature dialogs -> `src/features/*/ui/dialogs/*`,
      reusable dialogs -> `src/shared/ui/dialogs/*`.
  - [x] Moved feature dialog `CreateConfigurationDialog` to
        `src/features/settings/ui/dialogs/CreateConfigurationDialog.tsx`.
  - [x] Moved feature dialog `DeleteConfigurationDialog` to
        `src/features/settings/ui/dialogs/DeleteConfigurationDialog.tsx`.
  - [x] Moved feature dialog `GhCliSetupDialog` to
        `src/features/settings/ui/dialogs/GhCliSetupDialog.tsx`.
  - [x] Moved feature dialog `ReleaseNotesDialog` to
        `src/features/settings/ui/dialogs/ReleaseNotesDialog.tsx`.
  - [x] Moved feature dialog `OAuthDialog` to
        `src/features/settings/ui/dialogs/OAuthDialog.tsx`.
  - [x] Moved feature dialog `CreateWorkspaceFromPrDialog` to
        `src/features/command-bar/ui/dialogs/CreateWorkspaceFromPrDialog.tsx`.
  - [x] Moved feature dialog `StartReviewDialog` to
        `src/features/command-bar/ui/dialogs/StartReviewDialog.tsx`.
  - [x] Moved feature dialog `CreatePRDialog` to
        `src/features/command-bar/ui/dialogs/CreatePRDialog.tsx`.
  - [x] Moved reusable `LoginRequiredPrompt` to
        `src/shared/ui/dialogs/LoginRequiredPrompt.tsx`.
  - [x] Moved reusable `FolderPickerDialog` to
        `src/shared/ui/dialogs/FolderPickerDialog.tsx`.
  - [x] Moved reusable `ConfirmDialog` to
        `src/shared/ui/dialogs/ConfirmDialog.tsx`.
  - [x] Moved reusable `ImagePreviewDialog` to
        `src/shared/ui/dialogs/ImagePreviewDialog.tsx`.
  - [x] Moved reusable `TagEditDialog` to
        `src/shared/ui/dialogs/TagEditDialog.tsx`.
- [ ] `T1.5` Merge duplicate dialog concepts starting with `RebaseDialog.tsx`.
  - [x] Moved workspace-scoped `RebaseDialog` to
        `src/features/command-bar/ui/dialogs/RebaseDialog.tsx` and kept a
        compatibility shim at the legacy ui-new path.
- [ ] `T1.6` Keep compatibility shims at legacy dialog paths until final
      consolidation.
  - [x] Added compatibility shim at
        `src/components/dialogs/settings/CreateConfigurationDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/settings/DeleteConfigurationDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/auth/GhCliSetupDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/global/ReleaseNotesDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/global/OAuthDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/LoginRequiredPrompt.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/FolderPickerDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/ConfirmDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/wysiwyg/ImagePreviewDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/tasks/TagEditDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/CreateWorkspaceFromPrDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/tasks/StartReviewDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/tasks/CreatePRDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/ui-new/dialogs/RebaseDialog.tsx`.
- [ ] `T1.7` Update only UI-layer imports needed for this dialog/action move.
  - [x] Updated canonical callsites to
        `@/features/settings/ui/dialogs/CreateConfigurationDialog` in:
        `src/components/ui-new/dialogs/settings/AgentsSettingsSection.tsx`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/settings/ui/dialogs/DeleteConfigurationDialog` in:
        `src/components/ui-new/dialogs/settings/AgentsSettingsSection.tsx`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/settings/ui/dialogs/GhCliSetupDialog` in:
        `src/components/dialogs/tasks/CreatePRDialog.tsx`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/settings/ui/dialogs/ReleaseNotesDialog` in:
        `src/routes/__root.tsx`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/settings/ui/dialogs/OAuthDialog` in:
        `src/components/dialogs/index.ts`,
        `src/components/ui-new/actions/index.ts`,
        `src/components/ui-new/containers/SharedAppLayout.tsx`,
        `src/components/ui-new/dialogs/settings/OrganizationsSettingsSection.tsx`,
        `src/components/ui-new/dialogs/settings/RemoteProjectsSettingsSection.tsx`.
  - [x] Updated canonical callsite to
        `@/shared/ui/dialogs/LoginRequiredPrompt` in
        `src/features/kanban/ui/ProjectKanban.tsx`.
  - [x] Updated canonical callsites to
        `@/shared/ui/dialogs/FolderPickerDialog` in:
        `src/components/ui-new/containers/CreateModeRepoPickerBar.tsx`,
        `src/components/ui-new/dialogs/settings/GeneralSettingsSection.tsx`.
  - [x] Updated shared-dialog barrel export to canonical path in
        `src/components/dialogs/index.ts` for `ConfirmDialog`.
  - [x] Updated canonical callsite to
        `@/shared/ui/dialogs/ImagePreviewDialog` in
        `src/components/ui/wysiwyg.tsx`.
  - [x] Updated canonical callsites to
        `@/shared/ui/dialogs/TagEditDialog` in:
        `src/components/TagManager.tsx`,
        `src/components/ui/wysiwyg.tsx`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsite to
        `@/features/command-bar/ui/dialogs/CreateWorkspaceFromPrDialog` in
        `src/components/ui-new/actions/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/command-bar/ui/dialogs/StartReviewDialog` in:
        `src/components/ui-new/actions/index.ts`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsites to
        `@/features/command-bar/ui/dialogs/CreatePRDialog` in:
        `src/components/ui-new/actions/index.ts`,
        `src/components/dialogs/index.ts`.
  - [x] Updated canonical callsite to
        `@/features/command-bar/ui/dialogs/RebaseDialog` in
        `src/components/ui-new/actions/index.ts`.

## Risk Controls

- Prefer adding new canonical files plus re-export shims over broad rewrites.
- Avoid touching app-wide providers, hooks, stores, and shared API modules.
- If a change requires those layers, log it as a final-consolidation follow-up
  instead of doing it here.
- New information (2026-02-22): one `LoginRequiredPrompt` callsite lives in
  `src/features/kanban/ui/ProjectKanban.tsx`, outside the strict Track 1
  ownership paths. This track updated that single import to the canonical
  shared-ui path and kept a legacy shim to minimize future cross-branch churn.
- New information (2026-02-22): files moved into `src/shared/ui/dialogs/*` are
  not covered by the existing NiceModal default-import ESLint exception.
  Use named imports (`create`, `useModal`) from `@ebay/nice-modal-react` in
  shared dialog files, or plan an explicit lint-config update in final
  consolidation.
- New information (2026-02-22): some reusable dialogs are primarily consumed
  through `src/components/dialogs/index.ts` (barrel), so canonicalization can
  be achieved by updating barrel exports while keeping legacy file shims.
- New information (2026-02-22): reusable dialogs outside the `shared/` folder
  (e.g. under `components/dialogs/wysiwyg`) can also be migrated into
  `src/shared/ui/dialogs/*` with a legacy shim and a direct canonical import
  update when callsite count is low.
- New information (2026-02-22): files moved into
  `src/features/*/ui/dialogs/*` are also outside the current NiceModal
  default-import ESLint exception; use named imports (`create`, `useModal`) in
  these feature-owned dialog files as well.
- New information (2026-02-22): some feature-owned integration dialogs (like
  `GhCliSetupDialog`) are consumed from task dialogs outside the settings
  surface; keep compatibility shims and update only minimal canonical
  callsites/barrel exports during Track 1.
- New information (2026-02-22): feature-owned dialogs cannot import directly
  from `@/app/providers/*` under current lint rules; use the hook facades
  (e.g. `@/hooks/useTheme`) when a provider-backed dependency is needed.
- New information (2026-02-22): reusable dialogs originating from
  `components/dialogs/tasks/*` can be migrated to `src/shared/ui/dialogs/*`
  when callsites span multiple non-task UI surfaces.
- New information (2026-02-22): command-bar-owned dialogs can be migrated into
  `src/features/command-bar/ui/dialogs/*` and consumed directly from
  `src/components/ui-new/actions/index.ts` while keeping a legacy shim at the
  old `components/dialogs/*` path.
- New information (2026-02-22): when moving task dialogs into command-bar
  feature ownership, replace direct `@/app/providers/*` imports with hook
  facades (for example `@/hooks/useUserSystem`) to satisfy layer lint rules.
- New information (2026-02-22): some command-bar dialog callsites still live
  in non-owned task toolbar files (`src/components/tasks/**`) during Track 1;
  keep those paths stable via legacy shims and only canonicalize owned
  UI-layer imports.
- New information (2026-02-22): feature-owned dialog files cannot import
  directly from other `@/features/**` modules under current lint boundaries;
  when needed during Track 1, route through existing compatibility paths and
  defer deeper layer extraction to final consolidation.
- New information (2026-02-22): the two `RebaseDialog` implementations have
  different contracts (`attemptId/repoId` workspace flow vs branch-picking
  result flow), so Track 1 now canonicalizes only the workspace-scoped dialog
  in command-bar feature ownership and keeps the task-toolbar variant stable.
- New information (2026-02-22): some `OAuthDialog` callsites remain on the
  legacy global path by design (notably in `src/features/**`,
  `src/shared/ui/**`, and `src/lib/**`) because those layers cannot import
  `@/features/**` directly under current lint boundaries; keep shim coverage
  until final consolidation.

## Validation

- `pnpm run format`
- `pnpm run web:check`
- `pnpm run web:lint`

## Track Deliverables

- `src/components/ui-new/actions/index.ts` no longer contains monolithic logic.
- Dialog ownership is explicit by feature/shared layer.
- All previous import paths still resolve via compatibility shims.
- Track notes appended to `progress.parallel-track-1-ui-dialogs.txt`.
