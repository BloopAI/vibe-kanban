# `@vibe/web` Parallel Plan Track 2: Hooks, Contexts, and Stores

## Goal

Normalize model-layer state ownership (hooks, contexts, stores) without
colliding with UI/dialog work or shared/integration cleanup.

## Branch

- Recommended: `parallel/track-2-model`

## Exclusive Ownership (This Track)

- `packages/web/src/hooks/**`
- `packages/web/src/contexts/**`
- `packages/web/src/stores/**`
- `packages/web/src/features/*/model/**`
- `packages/web/src/entities/*/model/**`

## Do Not Modify In This Track

- `packages/web/src/components/dialogs/**`
- `packages/web/src/components/ui-new/dialogs/**`
- `packages/web/src/components/ui-new/actions/**`
- `packages/web/src/lib/**`
- `packages/web/src/utils/**`
- `packages/web/src/i18n/**`
- `packages/web/src/keyboard/**`
- `packages/web/src/vscode/**`
- `packages-web-cutover-plan.parallel-1-ui-dialogs.md`
- `packages-web-cutover-plan.parallel-3-shared-integrations.md`

## Work Packages

- [ ] `T2.1` Move domain hooks under owning feature/entity model folders.
- [ ] `T2.2` Consolidate duplicated hook families (conversation history,
      workspace/session variants, etc.).
- [ ] `T2.3` Move contexts to owning feature/entity model folders where
      practical, keeping app-level providers only where truly global.
- [ ] `T2.4` Move stores to `features/*/model/store` or `shared/stores`.
- [ ] `T2.5` Minimize provider depth by localizing provider trees to feature
      boundaries when possible.
- [ ] `T2.6` Keep compatibility shims at legacy hook/context/store paths until
      final consolidation.

## Risk Controls

- No dialog/action/API module rewrites in this track.
- Keep external import contract stable through re-export facades.
- If a move would require broad UI-file edits, defer import cleanup to final
  consolidation and leave shim in place.

## Validation

- `pnpm run format`
- `pnpm run web:check`
- `pnpm run web:lint`

## Track Deliverables

- Hook/context/store ownership is explicit by feature/entity/shared layer.
- Legacy hook/context/store paths still resolve via temporary shims.
- Provider trees are narrower where safe.
- Track notes appended to `progress.parallel-track-2-model.txt`.
