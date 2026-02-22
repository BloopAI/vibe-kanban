# Parallel Track 3: Shared + Integrations + API Split (Reset)

## Goal

Complete shared/integration normalization and break up API monoliths while
keeping stable facades during migration.

## Ownership

- In scope:
  - `packages/web/src/lib/**`
  - `packages/web/src/utils/**`
  - `packages/web/src/types/**`
  - `packages/web/src/constants/**`
  - `packages/web/src/i18n/**`
  - `packages/web/src/keyboard/**`
  - `packages/web/src/vscode/**`
  - `packages/web/src/shared/**`
  - `packages/web/src/integrations/**`
  - `packages/web/src/test/fixtures/**`
- Out of scope:
  - `src/hooks/**`, `src/contexts/**`, `src/stores/**`
  - dialog/action trees

## Baseline Risks To Resolve

- `src/lib/api.ts` is still monolithic (1368 lines).
- `src/lib/remoteApi.ts` is still monolithic (341 lines).
- Remaining real logic still exists under root `lib`, `utils`, `types`,
  `constants`, `keyboard`, and `i18n`.

## Work Packages

- [ ] `T3.1` Split `src/lib/api.ts` into domain modules under `src/shared/api/*`.
  - extract shared HTTP client + common error/types
  - split by domains (auth/config/sessions/attempts/repo/organization/etc.)
  - keep `src/lib/api.ts` as temporary facade aggregator
- [ ] `T3.2` Split `src/lib/remoteApi.ts` into `src/shared/api/remote/*`.
  - group attachment/issue/comment/project operations
  - keep `src/lib/remoteApi.ts` as temporary facade
- [ ] `T3.3` Finish migration of remaining root `lib`/`utils` real modules.
  - move implementations to `src/shared/lib/*` or `src/integrations/*`
  - reduce root files to facades only
- [ ] `T3.4` Normalize shared `types`, `constants`, `keyboard`, and `i18n`.
  - canonical locations under `src/shared/*`
  - root paths become compatibility facades
- [ ] `T3.5` Repoint callsites to canonical shared/integration paths.
  - remove non-facade imports from `@/lib/*`, `@/utils/*`, `@/types/*`,
    `@/constants/*`, and `@/keyboard/*`
- [ ] `T3.6` Verify and harden.
  - run `pnpm run web:check`
  - run `pnpm run web:lint`
  - append migration notes to progress log

## Exit Criteria

- API surface is domain-modular in `src/shared/api/*`.
- Root `lib/utils/types/constants/keyboard` directories contain facades only.
- Integrations are fully owned by `src/integrations/*`.
