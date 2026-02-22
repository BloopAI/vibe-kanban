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
- [ ] `T1.5` Merge duplicate dialog concepts starting with `RebaseDialog.tsx`.
- [ ] `T1.6` Keep compatibility shims at legacy dialog paths until final
      consolidation.
- [ ] `T1.7` Update only UI-layer imports needed for this dialog/action move.

## Risk Controls

- Prefer adding new canonical files plus re-export shims over broad rewrites.
- Avoid touching app-wide providers, hooks, stores, and shared API modules.
- If a change requires those layers, log it as a final-consolidation follow-up
  instead of doing it here.

## Validation

- `pnpm run format`
- `pnpm run web:check`
- `pnpm run web:lint`

## Track Deliverables

- `src/components/ui-new/actions/index.ts` no longer contains monolithic logic.
- Dialog ownership is explicit by feature/shared layer.
- All previous import paths still resolve via compatibility shims.
- Track notes appended to `progress.parallel-track-1-ui-dialogs.txt`.
