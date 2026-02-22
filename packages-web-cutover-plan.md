# `@vibe/web` Structure Standardization Plan (Reset)

## Reset Context

Date: 2026-02-22

The three parallel-track WIP branches have been merged into this branch.
This file replaces all prior plan state and tracks remaining work to completion.

## Goal

Finish the frontend structure migration so canonical ownership is clear and
legacy compatibility paths can be removed safely.

## Current Baseline (Post-Merge)

- Dialog surfaces are split across three trees with duplication:
  - `src/components/ui-new/dialogs/**`
  - `src/components/dialogs/**`
  - canonical feature/shared dialog trees
- Model layer still has mixed ownership:
  - `src/hooks/**`: 91 files
  - `src/contexts/**`: 23 files
  - `src/stores/**`: 6 files (mostly facades)
- Shared/integration split is incomplete:
  - `src/lib/api.ts`: 1368 lines
  - `src/lib/remoteApi.ts`: 341 lines
- Legacy imports are still widely used (`@/hooks`, `@/contexts`, `@/lib`,
  `@/components/dialogs`, `@/components/ui-new/dialogs`, etc.)

## Completion Tracks

- Track 1: `packages-web-cutover-plan.parallel-1-ui-dialogs.md`
  - UI actions + dialogs canonicalization
- Track 2: `packages-web-cutover-plan.parallel-2-model.md`
  - hooks/contexts/stores ownership normalization
- Track 3: `packages-web-cutover-plan.parallel-3-shared-integrations.md`
  - shared utilities, integrations, API module split

## Final Consolidation (After Tracks Complete)

- [ ] Remove temporary compatibility shims/facades created during migration.
- [ ] Delete dead legacy paths that no longer have importers.
- [ ] Tighten lint/import-boundary rules to block regressions.
- [ ] Run full verification:
  - `pnpm run format`
  - `pnpm run web:check`
  - `pnpm run web:lint`
  - `pnpm run check`
- [ ] Confirm no remaining imports from legacy roots unless explicitly allowed.

## Definition of Done

- Canonical ownership is enforced:
  - feature-owned UI in `src/features/*`
  - reusable UI in `src/shared/ui/*`
  - model logic in `src/features/*/model`, `src/entities/*/model`, or
    `src/shared/*`
  - integrations in `src/integrations/*`
- `src/components/ui-new/dialogs/**`, `src/components/dialogs/**`,
  `src/hooks/**`, `src/contexts/**`, `src/stores/**`, `src/lib/**`,
  `src/utils/**`, `src/types/**`, `src/constants/**`, and `src/keyboard/**`
  are either removed or strict facades with no business logic.
- Checks pass in CI and locally.
