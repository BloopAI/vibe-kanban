# Parallel Track 1: UI Actions + Dialog Canonicalization (Reset)

## Goal

Converge all dialog and action implementations onto canonical feature/shared
locations, then reduce legacy dialog trees to temporary facades only.

## Ownership

- In scope:
  - `packages/web/src/components/ui-new/actions/**`
  - `packages/web/src/components/ui-new/dialogs/**`
  - `packages/web/src/components/dialogs/**`
  - `packages/web/src/features/command-bar/ui/**`
  - `packages/web/src/features/settings/ui/**`
  - `packages/web/src/shared/ui/dialogs/**`
- Out of scope:
  - `src/hooks/**`, `src/contexts/**`, `src/stores/**`
  - `src/lib/**`, `src/utils/**`, `src/types/**`, `src/keyboard/**`

## Baseline Risks To Resolve

- Duplicate implementations exist across:
  - `components/ui-new/dialogs/*`
  - `components/dialogs/*`
  - `features/command-bar/ui/dialogs/*`
  - `features/settings/ui/dialogs/*`
  - `shared/ui/dialogs/*`
- `components/ui-new/actions/index.ts` remains a hotspot.
- Legacy dialog imports are still active (`@/components/dialogs/*`,
  `@/components/ui-new/dialogs/*`).

## Canonical Ownership Map (Locked 2026-02-22)

- Command-bar/task dialogs:
  - canonical: `src/features/command-bar/ui/dialogs/**`
  - legacy facades: `src/components/dialogs/tasks/**`,
    `src/components/ui-new/dialogs/**` (for command-bar-specific modules)
- Settings dialogs:
  - canonical: `src/features/settings/ui/dialogs/**`
  - legacy facades: `src/components/dialogs/settings/**`,
    `src/components/dialogs/global/**`, `src/components/dialogs/org/**`,
    `src/components/dialogs/auth/**`, `src/components/ui-new/dialogs/settings/**`
- Shared reusable dialogs:
  - canonical: `src/shared/ui/dialogs/**`
  - legacy facades: `src/components/dialogs/shared/**`,
    `src/components/ui-new/dialogs/**` (shared dialog compat entrypoints)
- Kanban filter dialog:
  - canonical: `src/features/kanban/ui/dialogs/KanbanFiltersDialog.tsx`
  - legacy facade: `src/components/ui-new/dialogs/KanbanFiltersDialog.tsx`
- Settings RJSF primitives:
  - canonical: `src/features/settings/ui/dialogs/settings/rjsf/**`
  - legacy facades: `src/components/ui-new/dialogs/settings/rjsf/**`

## Work Packages

- [x] `T1.1` Lock canonical ownership map per dialog/action module.
  - command-bar and settings dialogs: `src/features/*/ui/dialogs/*`
  - reusable dialogs: `src/shared/ui/dialogs/*`
  - legacy trees: facades only
- [ ] `T1.2` Resolve duplicate real implementations.
  - move/merge real implementations still under
    `src/components/ui-new/dialogs/**`
  - ensure `SettingsDialog` + settings section components have one source of
    truth
  - resolve `RebaseDialog`/task dialog duplication
- [ ] `T1.3` Finish action hotspot decomposition.
  - split `src/components/ui-new/actions/index.ts` into focused modules under
    `src/features/command-bar/ui/actions/*`
  - keep compatibility entrypoint only
- [ ] `T1.4` Repoint callsites to canonical paths.
  - migrate imports away from `@/components/dialogs/*`
  - migrate imports away from `@/components/ui-new/dialogs/*`
- [ ] `T1.5` Convert remaining legacy dialog files to strict facades.
  - no business logic in legacy trees
  - facades should only re-export canonical modules
- [ ] `T1.6` Verify and harden.
  - run `pnpm run web:check`
  - run `pnpm run web:lint`
  - append migration notes to progress log

### T1 Progress Notes

- [x] Moved `KanbanFiltersDialog.tsx` to canonical
      `src/features/kanban/ui/dialogs/KanbanFiltersDialog.tsx`.
- [x] Moved settings RJSF modules (`Fields.tsx`, `Templates.tsx`,
      `Widgets.tsx`, `theme.ts`) to canonical
      `src/features/settings/ui/dialogs/settings/rjsf/**`.
- [x] Updated canonical callsites:
  - `src/features/kanban/ui/KanbanContainer.tsx`
  - `src/features/settings/ui/dialogs/settings/ExecutorConfigForm.tsx`
- [x] Added strict legacy facades for moved modules at:
  - `src/components/ui-new/dialogs/KanbanFiltersDialog.tsx`
  - `src/components/ui-new/dialogs/settings/rjsf/**`
- [x] Applied boundary-safe import path for kanban filters:
  - `src/features/kanban/ui/dialogs/KanbanFiltersDialog.tsx` now imports
    assignee dialog via compatibility entrypoint
    `@/components/ui-new/dialogs/AssigneeSelectionDialog`.
- [ ] Remaining non-facade `ui-new/dialogs` implementations to resolve:
  - `src/components/ui-new/dialogs/RebaseDialog.tsx`
  - `src/components/ui-new/dialogs/SettingsDialog.tsx`
  - `src/components/ui-new/dialogs/settings/**` (except `rjsf/**`)

## Exit Criteria

- All dialog/action business logic lives in `features/*` or `shared/ui/*`.
- Legacy dialog trees are reduced to explicit, temporary facades.
- No non-facade imports depend on legacy dialog module paths.
