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

## Work Packages

- [ ] `T1.1` Lock canonical ownership map per dialog/action module.
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

## Exit Criteria

- All dialog/action business logic lives in `features/*` or `shared/ui/*`.
- Legacy dialog trees are reduced to explicit, temporary facades.
- No non-facade imports depend on legacy dialog module paths.
