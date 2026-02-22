# Parallel Track 2: Model Layer Normalization (Reset)

## Goal

Finish migration of hooks, contexts, and stores into feature/entity/shared model
ownership, then collapse root legacy model directories into compatibility
facades.

## Ownership

- In scope:
  - `packages/web/src/hooks/**`
  - `packages/web/src/contexts/**`
  - `packages/web/src/stores/**`
  - `packages/web/src/features/*/model/**`
  - `packages/web/src/entities/*/model/**`
  - `packages/web/src/shared/hooks/**`
  - `packages/web/src/shared/stores/**`
- Out of scope:
  - dialog/action trees under `components/dialogs` and `components/ui-new`
  - `src/lib/**`, `src/utils/**`, `src/types/**`, `src/keyboard/**`

## Baseline Risks To Resolve

- `src/hooks/**` still contains many real implementations and many facades.
- `src/contexts/**` still owns business logic that should be feature/shared.
- Root model imports remain high (`@/hooks`, `@/contexts`, `@/stores`).

## Work Packages

- [ ] `T2.1` Inventory remaining real hook implementations and classify ownership.
  - workspace/workspace-chat
  - organization/auth/user
  - preview/git/review
  - shared cross-feature utilities
- [ ] `T2.2` Move remaining real hooks to canonical model locations.
  - feature-owned hooks -> `src/features/*/model/hooks/*`
  - entity-owned hooks -> `src/entities/*/model/hooks/*`
  - shared hooks -> `src/shared/hooks/*`
- [ ] `T2.3` Move remaining real contexts to canonical locations.
  - feature contexts -> `src/features/*/model/contexts/*`
  - shared contexts -> `src/shared/*`
- [ ] `T2.4` Localize provider trees and reduce top-level provider depth.
  - move provider ownership closer to pages/features where feasible
- [ ] `T2.5` Repoint callsites away from root legacy model paths.
  - eliminate non-facade imports from `@/hooks/*`, `@/contexts/*`, `@/stores/*`
- [ ] `T2.6` Convert root model folders to strict facades.
  - root `hooks/contexts/stores` should expose compatibility exports only
- [ ] `T2.7` Verify and harden.
  - run `pnpm run web:check`
  - run `pnpm run web:lint`
  - append migration notes to progress log

## Exit Criteria

- No model business logic remains in root `src/hooks`, `src/contexts`, or
  `src/stores`.
- Canonical model ownership is feature/entity/shared.
- Remaining root model files are explicit compatibility facades only.
