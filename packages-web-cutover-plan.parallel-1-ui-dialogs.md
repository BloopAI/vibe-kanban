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
  - [x] Moved reusable `LoginRequiredPrompt` to
        `src/shared/ui/dialogs/LoginRequiredPrompt.tsx`.
  - [x] Moved reusable `FolderPickerDialog` to
        `src/shared/ui/dialogs/FolderPickerDialog.tsx`.
  - [x] Moved reusable `ConfirmDialog` to
        `src/shared/ui/dialogs/ConfirmDialog.tsx`.
- [ ] `T1.5` Merge duplicate dialog concepts starting with `RebaseDialog.tsx`.
- [ ] `T1.6` Keep compatibility shims at legacy dialog paths until final
      consolidation.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/LoginRequiredPrompt.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/FolderPickerDialog.tsx`.
  - [x] Added compatibility shim at
        `src/components/dialogs/shared/ConfirmDialog.tsx`.
- [ ] `T1.7` Update only UI-layer imports needed for this dialog/action move.
  - [x] Updated canonical callsite to
        `@/shared/ui/dialogs/LoginRequiredPrompt` in
        `src/features/kanban/ui/ProjectKanban.tsx`.
  - [x] Updated canonical callsites to
        `@/shared/ui/dialogs/FolderPickerDialog` in:
        `src/components/ui-new/containers/CreateModeRepoPickerBar.tsx`,
        `src/components/ui-new/dialogs/settings/GeneralSettingsSection.tsx`.
  - [x] Updated shared-dialog barrel export to canonical path in
        `src/components/dialogs/index.ts` for `ConfirmDialog`.

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

## Validation

- `pnpm run format`
- `pnpm run web:check`
- `pnpm run web:lint`

## Track Deliverables

- `src/components/ui-new/actions/index.ts` no longer contains monolithic logic.
- Dialog ownership is explicit by feature/shared layer.
- All previous import paths still resolve via compatibility shims.
- Track notes appended to `progress.parallel-track-1-ui-dialogs.txt`.
