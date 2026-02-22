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
- [x] `T3.3a` Moved `src/lib/firstProjectDestination.ts` to canonical
      `src/shared/lib/firstProjectDestination.ts` with legacy re-export facade
      kept at `src/lib/firstProjectDestination.ts`.
- [x] `T3.3b` Moved `src/lib/searchTagsAndFiles.ts` to canonical
      `src/shared/lib/searchTagsAndFiles.ts` with legacy re-export facade kept
      at `src/lib/searchTagsAndFiles.ts`.
- [x] `T3.3c` Moved `src/lib/projectOrder.ts` to canonical
      `src/shared/lib/projectOrder.ts` with legacy re-export facade kept at
      `src/lib/projectOrder.ts`.
- [x] `T3.3d` Moved `src/utils/diffHeightEstimate.ts` to canonical
      `src/shared/lib/diffHeightEstimate.ts` with legacy re-export facade kept
      at `src/utils/diffHeightEstimate.ts`.
- [x] `T3.3e` Moved `src/lib/paths.ts` to canonical
      `src/shared/lib/paths.ts` with legacy re-export facade kept at
      `src/lib/paths.ts`.
- [x] `T3.3f` Moved `src/lib/attachmentUtils.ts` to canonical
      `src/shared/lib/attachmentUtils.ts` with legacy re-export facade kept at
      `src/lib/attachmentUtils.ts`.
- [x] `T3.3g` Moved `src/utils/diffStatsParser.ts` to canonical
      `src/shared/lib/diffStatsParser.ts` with legacy re-export facade kept at
      `src/utils/diffStatsParser.ts`.
- [x] `T3.3h` Moved `src/utils/aggregateEntries.ts` to canonical
      `src/shared/lib/aggregateEntries.ts` with legacy re-export facade kept at
      `src/utils/aggregateEntries.ts`.
- [x] `T3.3i` Moved `src/utils/diffDataAdapter.ts` to canonical
      `src/shared/lib/diffDataAdapter.ts` with legacy re-export facade kept at
      `src/utils/diffDataAdapter.ts`.
- [x] `T3.3j` Moved `src/utils/terminalTheme.ts` to canonical
      `src/shared/lib/terminalTheme.ts` with legacy re-export facade kept at
      `src/utils/terminalTheme.ts`.
- [x] `T3.3k` Moved `src/utils/TruncatePath.tsx` to canonical
      `src/shared/lib/TruncatePath.tsx` with legacy re-export facade kept at
      `src/utils/TruncatePath.tsx`.
- [x] `T3.3l` Moved `src/utils/StyleOverride.tsx` to canonical
      `src/shared/lib/StyleOverride.tsx` with legacy re-export facade kept at
      `src/utils/StyleOverride.tsx`.
- [x] `T3.3m` Moved `src/utils/promptMessage.ts` to canonical
      `src/shared/lib/promptMessage.ts` with legacy re-export facade kept at
      `src/utils/promptMessage.ts`.
- [x] `T3.3n` Moved `src/utils/recentModels.ts` to canonical
      `src/shared/lib/recentModels.ts` with legacy re-export facade kept at
      `src/utils/recentModels.ts`.
- [x] `T3.3o` Moved `src/utils/date.ts` to canonical
      `src/shared/lib/date.ts` with legacy re-export facade kept at
      `src/utils/date.ts`.
- [x] `T3.3p` Moved `src/utils/extToLanguage.ts` to canonical
      `src/shared/lib/extToLanguage.ts` with legacy re-export facade kept at
      `src/utils/extToLanguage.ts`.
- [x] `T3.3q` Moved `src/utils/fileTypeIcon.ts` to canonical
      `src/shared/lib/fileTypeIcon.ts` with legacy re-export facade kept at
      `src/utils/fileTypeIcon.ts`.
- [x] `T3.3r` Moved `src/utils/fileTreeUtils.ts` to canonical
      `src/shared/lib/fileTreeUtils.ts` with legacy re-export facade kept at
      `src/utils/fileTreeUtils.ts`.
- [x] `T3.3s` Moved `src/lib/resolveRelationships.ts` to canonical
      `src/shared/lib/resolveRelationships.ts` with legacy re-export facade
      kept at `src/lib/resolveRelationships.ts`.
- [x] `T3.3t` Moved `src/utils/modelSelector.ts` to canonical
      `src/shared/lib/modelSelector.ts` with legacy re-export facade kept at
      `src/utils/modelSelector.ts`.
- [x] `T3.3u` Moved `src/utils/previewDevToolsBridge.ts` to canonical
      `src/shared/lib/previewDevToolsBridge.ts` with legacy re-export facade
      kept at `src/utils/previewDevToolsBridge.ts`.
- [x] `T3.3v` Moved `src/utils/theme.ts` to canonical
      `src/shared/lib/theme.ts` with legacy re-export facade kept at
      `src/utils/theme.ts`.
- [x] `T3.3w` Moved `src/utils/jsonPatch.ts` to canonical
      `src/shared/lib/jsonPatch.ts` with legacy re-export facade kept at
      `src/utils/jsonPatch.ts`.
- [x] `T3.3x` Moved `src/lib/devServerUtils.ts` to canonical
      `src/shared/lib/devServerUtils.ts` with legacy re-export facade kept at
      `src/lib/devServerUtils.ts`.
- [x] `T3.3y` Moved `src/utils/streamJsonPatchEntries.ts` to canonical
      `src/shared/lib/streamJsonPatchEntries.ts` with legacy re-export facade
      kept at `src/utils/streamJsonPatchEntries.ts`.
- [x] `T3.3z` Moved `src/utils/string.ts` to canonical
      `src/shared/lib/string.ts` with legacy re-export facade kept at
      `src/utils/string.ts`.
- [x] `T3.3aa` Moved `src/utils/executor.ts` to canonical
      `src/shared/lib/executor.ts` with legacy re-export facade kept at
      `src/utils/executor.ts`.
- [x] `T3.3ab` Moved `src/lib/hmrContext.ts` to canonical
      `src/shared/lib/hmrContext.ts` with legacy re-export facade kept at
      `src/lib/hmrContext.ts`.
- [x] `T3.3ac` Moved `src/lib/workspaceDefaults.ts` to canonical
      `src/shared/lib/workspaceDefaults.ts` with legacy re-export facade kept
      at `src/lib/workspaceDefaults.ts`.
- [x] `T3.3ad` Moved `src/lib/workspaceCreateState.ts` to canonical
      `src/shared/lib/workspaceCreateState.ts` with legacy re-export facade
      kept at `src/lib/workspaceCreateState.ts`.
- [x] `T3.3ae` Moved `src/lib/utils.ts` to canonical
      `src/shared/lib/utils.ts` with legacy re-export facade kept at
      `src/lib/utils.ts`.
- [x] `T3.3af` Moved `src/lib/routes/navigation.ts` to canonical
      `src/shared/lib/routes/navigation.ts` with legacy re-export facade kept
      at `src/lib/routes/navigation.ts`.
- [x] `T3.3ag` Moved `src/lib/routes/pathResolution.ts` to canonical
      `src/shared/lib/routes/pathResolution.ts` with legacy re-export facade
      kept at `src/lib/routes/pathResolution.ts`.
- [x] `T3.3ah` Moved `src/lib/routes/projectSidebarRoutes.ts` to canonical
      `src/shared/lib/routes/projectSidebarRoutes.ts` with legacy re-export
      facade kept at `src/lib/routes/projectSidebarRoutes.ts`.
- [x] `T3.3ai` Moved `src/lib/auth/tokenManager.ts` to canonical
      `src/shared/lib/auth/tokenManager.ts` with legacy re-export facade kept
      at `src/lib/auth/tokenManager.ts`.
- [x] `T3.3aj` Moved `src/lib/electric/types.ts` to canonical
      `src/shared/lib/electric/types.ts` with legacy re-export facade kept at
      `src/lib/electric/types.ts`.
- [x] `T3.3ak` Moved `src/lib/electric/collections.ts` to canonical
      `src/shared/lib/electric/collections.ts` with legacy re-export facade
      kept at `src/lib/electric/collections.ts`.
- [x] `T3.3al` Moved `src/lib/types.ts` to canonical
      `src/shared/lib/types.ts` with legacy re-export facade kept at
      `src/lib/types.ts`.
- [x] `T3.3am` Moved `src/utils/scriptPlaceholders.ts` to canonical
      `src/shared/lib/scriptPlaceholders.ts` with legacy re-export facade kept
      at `src/utils/scriptPlaceholders.ts`.
- [x] `T3.3an` Moved `src/utils/id.ts` to canonical
      `src/shared/lib/id.ts` with legacy re-export facade kept at
      `src/utils/id.ts`.
- [x] `T3.3ao` Moved `src/lib/conflicts.ts` to canonical
      `src/shared/lib/conflicts.ts` with legacy re-export facade kept at
      `src/lib/conflicts.ts`.
- [x] `T3.3ap` Moved `src/lib/mcpStrategies.ts` to canonical
      `src/shared/lib/mcpStrategies.ts` with legacy re-export facade kept at
      `src/lib/mcpStrategies.ts`.
- [x] `T3.3aq` Moved `src/lib/colors.ts` to canonical
      `src/shared/lib/colors.ts` with legacy re-export facade kept at
      `src/lib/colors.ts`.
- [x] `T3.3ar` Moved `src/utils/platform.ts` to canonical
      `src/shared/lib/platform.ts` with legacy re-export facade kept at
      `src/utils/platform.ts`.
- [x] `T3.3as` Moved `src/utils/previewBridge.ts` to canonical
      `src/shared/lib/previewBridge.ts` with legacy re-export facade kept at
      `src/utils/previewBridge.ts`.
- [ ] `T3.4` Normalize `types`, `constants`, `i18n`, and `keyboard` under
      `src/shared/*`.
- [x] `T3.4a` Moved `src/keyboard/types.ts` to canonical
      `src/shared/keyboard/types.ts` with legacy re-export facade kept at
      `src/keyboard/types.ts`.
- [x] `T3.4b` Moved `src/constants/processes.ts` to canonical
      `src/shared/constants/processes.ts` with legacy re-export facade kept at
      `src/constants/processes.ts`.
- [x] `T3.4c` Moved `src/types/previewDevTools.ts` to canonical
      `src/shared/types/previewDevTools.ts` with legacy re-export facade kept
      at `src/types/previewDevTools.ts`.
- [x] `T3.4d` Moved `src/types/logs.ts` to canonical
      `src/shared/types/logs.ts` with legacy re-export facade kept at
      `src/types/logs.ts`.
- [x] `T3.4e` Moved `src/types/diff.ts` to canonical
      `src/shared/types/diff.ts` with legacy re-export facade kept at
      `src/types/diff.ts`.
- [x] `T3.4f` Moved `src/types/attempt.ts` to canonical
      `src/shared/types/attempt.ts` with legacy re-export facade kept at
      `src/types/attempt.ts`.
- [x] `T3.4g` Moved `src/types/tabs.ts` to canonical
      `src/shared/types/tabs.ts` with legacy re-export facade kept at
      `src/types/tabs.ts`.
- [x] `T3.4h` Moved `src/keyboard/registry.ts` to canonical
      `src/shared/keyboard/registry.ts` with legacy re-export facade kept at
      `src/keyboard/registry.ts`.
- [x] `T3.4i` Moved `src/keyboard/useSemanticKey.ts` to canonical
      `src/shared/keyboard/useSemanticKey.ts` with legacy re-export facade kept
      at `src/keyboard/useSemanticKey.ts`.
- [ ] `T3.5` Move external adapters to `src/integrations/electric/*` and
      `src/integrations/vscode/*`.
- [x] `T3.5a` Moved `src/lib/electric/hooks.ts` to canonical
      `src/integrations/electric/hooks.ts` with legacy re-export facade kept at
      `src/lib/electric/hooks.ts`.
- [x] `T3.5b` Moved `src/vscode/bridge.ts` to canonical
      `src/integrations/vscode/bridge.ts` with legacy re-export facade kept at
      `src/vscode/bridge.ts`.
- [x] `T3.5c` Moved `src/vscode/ContextMenu.tsx` to canonical
      `src/integrations/vscode/ContextMenu.tsx` with legacy re-export facade
      kept at `src/vscode/ContextMenu.tsx`.
- [ ] `T3.6` Move `src/mock/*` to `src/test/fixtures/*` where appropriate.
- [x] `T3.6a` Moved `src/mock/normalized_entries.json` to canonical
      `src/test/fixtures/normalized_entries.json` and kept a compatibility copy
      at `src/mock/normalized_entries.json`.
- [ ] `T3.7` Keep legacy entrypoints as compatibility re-export facades to
      minimize cross-branch import churn.

## Risk Controls

- Prefer additive canonical modules + facade wrappers over bulk import rewrites.
- Avoid editing feature UI/component files unless absolutely required.
- Defer full call-site rewrite and facade removal to final consolidation.
- When moving modules into `src/shared/**`, keep `shared` imports limited to
  `shared` dependencies; bridge app-level hooks via wrapper/facade modules.
- Some remaining `src/lib/*` and `src/utils/*` modules are referenced by
  Track 1-owned files; keep those legacy import paths stable via facades until
  cross-track consolidation.
- For modules that still have `src/hooks/**` callsites, update non-restricted
  callsites first and keep hook imports on legacy facades until consolidation.
- `src/lib/modals.ts` cannot be moved into `src/shared/**` yet because lint
  rules intentionally restrict direct `NiceModal` usage to `src/lib/modals.ts`;
  defer that migration until rule/path consolidation.

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
