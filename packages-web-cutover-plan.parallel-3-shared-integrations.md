# `@vibe/web` Parallel Plan Track 3: Shared + Integrations + API Split

## Goal

Complete shared/integration normalization and split API monoliths while keeping
import compatibility stable during the parallel phase.

## Branch

- Recommended: `parallel/track-3-shared-integrations`

## Exclusive Ownership (This Track)

- `packages/web/src/lib/**`
- `packages/web/src/utils/**`
- `packages/web/src/types/**`
- `packages/web/src/constants/**`
- `packages/web/src/i18n/**`
- `packages/web/src/keyboard/**`
- `packages/web/src/vscode/**`
- `packages/web/src/mock/**`
- `packages/web/src/shared/**`
- `packages/web/src/integrations/**`
- `packages/web/src/test/fixtures/**`

## Do Not Modify In This Track

- `packages/web/src/components/ui-new/actions/**`
- `packages/web/src/components/ui-new/dialogs/**`
- `packages/web/src/components/dialogs/**`
- `packages/web/src/hooks/**`
- `packages/web/src/contexts/**`
- `packages/web/src/stores/**`
- `packages-web-cutover-plan.parallel-1-ui-dialogs.md`
- `packages-web-cutover-plan.parallel-2-model.md`

## Work Packages

- [ ] `T3.1` Split `src/lib/api.ts` into domain-scoped modules under
      `src/shared/api/*`.
- [ ] `T3.2` Split `src/lib/remoteApi.ts` similarly and co-locate domain API
      contracts.
- [ ] `T3.3` Move reusable helpers from `src/lib/*` and `src/utils/*` into
      `src/shared/lib/*`.
- [ ] `T3.4` Normalize `types`, `constants`, `i18n`, and `keyboard` under
      `src/shared/*`.
- [ ] `T3.5` Move external adapters to `src/integrations/electric/*` and
      `src/integrations/vscode/*`.
- [ ] `T3.6` Move `src/mock/*` to `src/test/fixtures/*` where appropriate.
- [ ] `T3.7` Keep legacy entrypoints as compatibility re-export facades to
      minimize cross-branch import churn.

## Risk Controls

- Prefer additive canonical modules + facade wrappers over bulk import rewrites.
- Avoid editing feature UI/component files unless absolutely required.
- Defer full call-site rewrite and facade removal to final consolidation.

## Validation

- `pnpm run format`
- `pnpm run web:check`
- `pnpm run web:lint`
- `pnpm --filter @vibe/web run build`

## Track Deliverables

- API monoliths decomposed into shared domain modules.
- Integrations and shared utility layers are in canonical locations.
- Legacy import paths remain valid through temporary facades.
- Track notes appended to `progress.parallel-track-3-shared-integrations.txt`.
