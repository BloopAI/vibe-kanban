# Refactor Lint Triage (no-restricted-imports)

Use this file to evaluate one ESLint architecture violation at a time and
choose a consistent refactor action.

## Scope

This checklist is for layer-boundary violations in `packages/web`, especially:

- `features -> app`
- `features -> features`
- `shared -> features`

## How To Use (Single Issue Workflow)

Run this workflow against exactly one ESLint error.

1. Paste the issue details into one row in the tracking table.
2. Run the decision tree for that issue only.
3. Pick exactly one primary action (`A1`-`A5`).
4. Add follow-up tasks if needed.
5. Implement and validate before moving to the next issue.

## Decision Tree

1. Is the imported module pure/generic and reusable across domains?
- Yes: move it to `shared` (or import from existing `shared` module).
- No: continue.

2. Is it app wiring/runtime orchestration (providers, router, bootstrapping)?
- Yes: keep in `app`; inject data/handlers into feature from app-level composition.
- No: continue.

3. Is it domain-specific state/model used by multiple feature slices?
- Yes: extract stable domain contract to `shared` (types/selectors/helpers),
  keep feature-specific adapters inside each feature.
- No: continue.

4. Is `shared` importing from `features`?
- Yes: move the imported code/type down into `shared` (or split out a shared
  contract); `shared` must not depend on higher layers.
- No: continue.

5. Is the import only needed because of convenience/re-export path?
- Yes: switch import to the proper owning layer path.
- No: continue.

6. If none fit, dependency direction is likely wrong:
- Move caller upward (to app/page) or split module responsibilities.

## Action Matrix

### A1: Repoint To Existing Lower Layer

Use when a valid `shared`/`integrations` module already exists.

- Change import path only.
- No module move needed.

### A2: Move Module Down To Shared

Use when module is cross-cutting and not feature-specific.

- Move file to `src/shared/...`
- Update imports.
- Keep naming neutral (no feature terminology in shared APIs).

### A3: Split Contract From Implementation

Use when feature implementation is specific but types/helpers are reusable.

- Extract `type` / pure helper to `shared`.
- Keep feature runtime logic in feature.

### A4: Dependency Inversion (App Injection)

Use for `features -> app` violations.

- Keep provider/hooks in `app`.
- Pass required data/functions from app to feature (props/context/adapter).

### A5: Move Caller Instead Of Dependency

Use when the caller is in the wrong layer.

- Move caller to app/page or correct feature slice.
- Leave dependency where it belongs.

## Do Not

- Do not disable `no-restricted-imports` to bypass structure issues.
- Do not move domain-specific behavior into `shared` just to satisfy lint.
- Do not add new cross-feature imports as "temporary" fixes.

## Quick Heuristics

- If 3+ feature areas import it, it likely belongs in `shared`.
- If it touches routing/providers/global bootstrap, it likely belongs in `app`.
- If it encodes one domain workflow, keep it in that feature.

## Single-Issue Tracking Row

| Status | File | Line | Importer Layer | Imported Module | Violation Type | Decision (A1-A5) | Action Summary | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DONE | `src/features/command-bar/ui/actions/useActionVisibility.ts` | `8` | feature | `@/features/workspace-chat/model/store/useDiffViewStore` | `features -> features` | A2 | Moved `useDiffViewStore` to `src/shared/stores` and repointed imports | codex | First lint violation from current run |
| DONE | `src/features/command-bar/ui/actions/useActionVisibility.ts` | `13` | feature | `@/app/providers/ConfigProvider` | `features -> app` | A3 | Split `useUserSystem` hook + context types to `src/shared/hooks/useUserSystem.ts`, kept provider in `app`, repointed all 30 consumers | claude | Cross-cutting config access used by 31 files; eliminated 8 lint errors |
| DONE | `src/features/command-bar/ui/actions/useActionVisibility.ts` | `14` | feature | `@/features/workspace/model/hooks/useDevServer` | `features -> features` | A1 | Repointed import to `@/hooks` barrel re-export (already existed in `hooks/index.ts`) | claude | Import path change only; no module move needed |
| DONE | `src/components/NormalizedConversation/DisplayConversationEntry.tsx` | `14` | legacy (components) | `@/features/workspace-chat/model/store/useExpandableStore` | `legacy -> features` | A2 | Moved `useExpandableStore` to `src/shared/stores/useExpandableStore.ts`, deleted old file, repointed 3 consumers | claude | Pure generic zustand store with zero domain logic |
| DONE | `src/components/NormalizedConversation/DisplayConversationEntry.tsx` | `36` | legacy (components) | `@/features/workspace-chat/model/contexts/RetryUiContext` | `legacy -> features` | A3 | Split `useRetryUi` hook + context + types to `src/shared/hooks/useRetryUi.ts`, kept provider in features, repointed 3 consumers | claude | Provider depends on ExecutionProcessesContext (feature), but hook/types are pure |
| DONE | `src/components/NormalizedConversation/DisplayConversationEntry.tsx` | `42` | legacy (components) | `@/features/workspace/model/hooks/useAttemptRepo` | `legacy -> features` | A2 | Moved `useAttemptRepo` to `src/shared/hooks/useAttemptRepo.ts`, deleted old file, repointed 6 consumers | claude | No feature deps; only uses @/lib/api + shared/types |
| DONE | `src/components/NormalizedConversation/EditDiffRenderer.tsx` | `12` | legacy (components) | `@/app/styles/diff-style-overrides.css` | `legacy -> app` | A1 | Repointed 3 files from `@/app/styles/` to existing `@/styles/` proxies; also fixed `edit-diff-overrides.css` | claude | CSS-only; `@/styles/` proxies already existed; 5 violations fixed |
| DONE | `src/components/NormalizedConversation/PendingApprovalEntry.tsx` | `25` | legacy (components) | `@/features/workspace-chat/model/contexts/ApprovalFormContext` | `legacy -> features` | A2 | Moved `ApprovalFormContext` to `src/shared/hooks/ApprovalForm.tsx`, left re-export shim in features, repointed 2 consumers | claude | Pure form state context; no feature deps |
| DONE | `src/components/NormalizedConversation/RetryEditorInline.tsx` | `11` | legacy (components) | `@/features/workspace-chat/model/hooks/useAttemptExecution` | `legacy -> features` | A3 | Split `useExecutionProcessesContext` hook+context+types to `shared/hooks/useExecutionProcessesContext.ts`, moved `useTaskDetailsUiStore` to `shared/stores/`, moved `useAttemptExecution` to `shared/hooks/`, repointed 7+4 consumers | claude | Required cascading A3+A2: useAttemptExecution depended on 2 feature modules (ExecutionProcessesContext, useTaskDetailsUiStore) which both needed extraction first |
| DONE | `src/components/NormalizedConversation/RetryEditorInline.tsx` | `13` | legacy (components) | `@/features/workspace/model/hooks/useBranchStatus` | `legacy -> features` | A2 | Moved `useBranchStatus` to `src/shared/hooks/useBranchStatus.ts`, deleted old file, repointed 8 consumers | claude | Pure react-query hook; only depends on @/lib/api (shared-level); 5 violations eliminated |
| DONE | `src/components/NormalizedConversation/RetryEditorInline.tsx` | `15` | legacy (components) | `@/features/workspace-chat/model/hooks/useRetryProcess` | `legacy -> features` | A2 | Moved `useRetryProcess` to `src/shared/hooks/useRetryProcess.ts`, deleted old file, repointed 2 consumers | claude | All deps shared-level (@/lib/api, @/dialogs, shared/types); 2 violations eliminated |
| DONE | `src/components/agents/AgentIcon.tsx` | `2` | legacy (components) | `@/app/providers/ThemeProvider` | `legacy -> app` | A3 | Split `useTheme` hook + `getResolvedTheme` + context to `src/shared/hooks/useTheme.ts`, kept `ThemeProvider` in app, repointed 13 consumers | claude | Same pattern as useUserSystem; cross-cutting theme access used by 14 files; 6 violations eliminated |
| DONE | `src/components/tasks/TaskDetails/ProcessesTab.tsx` | `14` | legacy (components) | `@/features/workspace-chat/model/hooks/useExecutionProcesses` | `legacy -> features` | A2 | Moved `useExecutionProcesses` to `src/shared/hooks/useExecutionProcesses.ts`, deleted old file, repointed 6 consumers | claude | Pure WS streaming hook; only depends on @/hooks/useJsonPatchWsStream + shared/types; 2 violations eliminated |
| DONE | `src/components/tasks/TaskDetails/ProcessesTab.tsx` | `19` | legacy (components) | `@/features/workspace-chat/model/contexts/ProcessSelectionContext` | `legacy -> features` | A2 | Moved `ProcessSelectionContext.tsx` to `src/shared/hooks/ProcessSelectionContext.tsx`, deleted old file, repointed 2 consumers | claude | Pure string state context; zero domain logic, zero feature deps; 1 violation eliminated |
| DONE | `src/components/ui/wysiwyg.tsx` | `76` | legacy (components) | `@/features/command-bar/ui/actions/pages` | `legacy -> features` | A3 | Extracted `RepoItem`, `StatusItem`, `PriorityItem`, `BranchItem` types to `src/shared/types/selectionItems.ts`, updated `pages.ts` to re-export, repointed 2 component consumers | claude | Only types crossed the boundary; pages.ts re-exports for backward compat; 1 violation eliminated |
| DONE | `src/contexts/ActionsContext.tsx` | `23` | legacy (contexts) | `@/features/command-bar/ui/actions/useActionVisibility` | `legacy -> features` | A3 | Moved 6 pure action helpers (`isActionVisible`, `isActionActive`, `isActionEnabled`, `getActionIcon`, `getActionTooltip`, `getActionLabel`) to `@/components/ui-new/actions/index.ts`, kept `isPageVisible` + `useActionVisibilityContext` in features, repointed 5 consumers | claude | Helpers are pure functions on ActionDefinition+ActionVisibilityContext types already in shared; `isPageVisible` stays (depends on feature-level CommandBarPage type); 1 violation eliminated |
| DONE | `src/contexts/ActionsContext.tsx` | `26` | legacy (contexts) | `@/features/workspace/model/hooks/useDevServer` | `legacy -> features` | A2 | Moved `useDevServer` to `src/shared/hooks/useDevServer.ts`, extracted `workspaceSummaryKeys` to `src/shared/hooks/workspaceSummaryKeys.ts`, deleted old file, repointed 9 consumers across contexts/hooks/features/components | claude | Pure mutation hook; all deps shared-level once query keys extracted; `workspaceSummaryKeys` was also cross-layer imported by 6 other files; 3 violations eliminated |
| DONE | `src/contexts/CreateModeContext.tsx` | `4` | legacy (contexts) | `@/features/workspace/model/hooks/useCreateModeState` | `legacy -> features` | A2 | Moved `useCreateModeState` and `useWorkspaceCreateDefaults` to `src/shared/hooks/`, deleted old files, repointed 3 consumers | claude | Both hooks pure/generic; only feature dep was `useWorkspaceCreateDefaults` (also pure, moved together); 1 violation eliminated |
| DONE | `src/contexts/CreateModeContext.tsx` | `8` | legacy (contexts) | `@/features/workspace/model/hooks/useWorkspaces` | `legacy -> features` | A2 | Moved `useWorkspaces` to `src/shared/hooks/useWorkspaces.ts`, deleted old file, repointed 4 consumers | claude | Pure WS streaming + react-query hook; all deps shared-level; 2 violations eliminated |
| DONE | `src/contexts/WorkspaceContext.tsx` | `10` | legacy (contexts) | `@/features/workspace/model/hooks/useAttempt` | `legacy -> features` | A2 | Moved `useAttempt` to `src/shared/hooks/useAttempt.ts`, deleted old file, repointed 6 consumers | claude | Pure react-query hook; zero feature deps; 2 violations eliminated |
| DONE | `src/contexts/WorkspaceContext.tsx` | `12` | legacy (contexts) | `@/features/workspace/model/hooks/useWorkspaceSessions` | `legacy -> features` | A2 | Moved `useWorkspaceSessions` to `src/shared/hooks/useWorkspaceSessions.ts`, deleted old file, repointed 2 consumers | claude | Pure react-query + state hook; zero feature deps; 1 violation eliminated |
| DONE | `src/features/workspace-chat/ui/SessionChatBoxContainer.tsx` | `22,49` | features (workspace-chat) | `@/features/workspace-chat/model/hooks/useTodos`, `@/features/workspace-chat/model/store/useInspectModeStore` | `features -> features (intra)` | A1 | Changed absolute `@/features/` imports to relative `../model/` paths | claude | Intra-feature imports; ESLint bans absolute `@/features/` paths within features; 2 violations eliminated |
| DONE | `src/features/workspace-chat/ui/SessionChatBoxContainer.tsx` | `59` | features (workspace-chat) | `@/features/command-bar/ui/actions/useActionVisibility` | `features -> features` | A3 | Extracted `useActionVisibilityContext` hook to `src/hooks/useActionVisibilityContext.ts`, slimmed `useActionVisibility.ts` to only `isPageVisible`, repointed 4 consumers | claude | Hook depends on `@/integrations/electric/hooks` so placed in legacy `hooks/` (not `shared/`) since shared can't import integrations; `isPageVisible` stays in features (depends on feature-level `CommandBarPage` type); 2 violations eliminated |
| DONE | `src/features/workspace/model/hooks/useChangeTargetBranch.ts` | `7` | features (workspace) | `@/features/workspace/model/hooks/useRepoBranches` | `features -> features (intra, absolute)` | A2 | Moved `useRepoBranches` to `src/shared/hooks/useRepoBranches.ts`, deleted old file, repointed 9 consumers (4 intra-feature + 3 cross-layer + 2 barrel), removed re-export from `hooks/index.ts` | claude | Pure react-query hook; zero feature deps; imported by 5 layers (features, components, dialogs, hooks barrel); 5 violations eliminated |
| DONE | `src/features/workspace/model/hooks/useProjectWorkspaceCreateDraft.ts` | `3` | features (workspace) | `@/features/kanban/model/hooks/useKanbanNavigation` | `features -> features` | A2 | Moved `useKanbanNavigation` to `src/shared/hooks/useKanbanNavigation.ts`, deleted old file, repointed 8 consumers (1 cross-feature + 5 components + 2 intra-kanban) | claude | Pure navigation hook; deps are router + shared route utils; imported by 3 layers; 1 violation eliminated |
| DONE | `src/features/workspace/ui/VSCodeWorkspacePage.tsx` | `11,16,17,18` | features (workspace) | `SessionChatBoxContainer`, `EntriesContext`, `MessageEditContext`, `RetryUiContext` from `@/features/workspace-chat` | `features -> features` | A5 | Moved `VSCodeWorkspacePage.tsx` from `features/workspace/ui/` to `pages/workspaces/`, updated route import | claude | Page-level composition component that orchestrates workspace-chat providers; belongs in pages layer not features; 5 violations eliminated |
| DONE | `src/features/workspace/ui/WorkspacesLayout.tsx` | `7` | features (workspace) | `@/features/workspace-chat/model/contexts/ExecutionProcessesContext` | `features -> features` | A5 | Moved `WorkspacesLayout.tsx` from `features/workspace/ui/` to `pages/workspaces/`, updated import in `Workspaces.tsx` | claude | Page-level layout orchestrating providers from multiple features; same pattern as VSCodeWorkspacePage; 1 violation eliminated |
| DONE | `src/hooks/index.ts` | `4` | legacy (hooks) | `@/features/workspace/model/hooks/useTaskAttempt` | `legacy -> features` | A2 | Moved `useTaskAttempt` to `src/shared/hooks/useTaskAttempt.ts`, deleted old file, repointed 1 direct consumer (`GitActionsDialog.tsx`), removed unused barrel re-export | claude | Pure react-query hook; zero feature deps; no barrel consumers; 1 violation eliminated |
| DONE | `src/hooks/index.ts` | `7` | legacy (hooks) | `@/features/workspace/model/hooks/useRebase` | `legacy -> features` | A2 | Moved `useRebase` to `src/shared/hooks/useRebase.ts`, deleted old file, repointed `useGitOperations.ts`, removed unused barrel re-export | claude | Pure mutation hook; deps all shared-level (`@/lib/api`, `@/shared/hooks/useRepoBranches`); 2 violations eliminated |
| DONE | `src/hooks/index.ts` | `7-11` + `useGitOperations.ts` | legacy (hooks) | `useChangeTargetBranch`, `useRenameBranch`, `useMerge`, `usePush`, `useAttemptConflicts`, `useForcePush` from `@/features/workspace` | `legacy -> features` | A2 | Batch-moved 6 git mutation hooks to `src/shared/hooks/`, repointed `useGitOperations.ts` + `GitPanelContainer` + `ForcePushDialog` + `EditBranchNameDialog`, removed 5 unused barrel re-exports | claude | All pure mutation hooks with shared-level deps only (`@/lib/api`, `shared/types`, `@/shared/hooks/useRepoBranches`); 9 violations eliminated |
| DONE | `src/hooks/index.ts` | `10,11` | legacy (hooks) | `@/features/workspace/model/hooks/useRepoBranchSelection` | `legacy -> features` | A2 | Moved `useRepoBranchSelection` to `src/shared/hooks/useRepoBranchSelection.ts`, repointed 1 barrel consumer (`RepoBranchSelector.tsx`), removed 2 barrel re-exports | claude | Pure hook; deps all shared-level (`react-query`, `@/lib/api`, `@/shared/hooks/useRepoBranches`); 2 violations eliminated |
| DONE | `src/hooks/index.ts` | `10` | legacy (hooks) | `@/features/workspace/model/hooks/useTaskAttempts` | `legacy -> features` | A2 | Moved `useTaskAttempts` to `src/shared/hooks/useTaskAttempts.ts`, deleted old file, removed unused barrel re-export | claude | Pure react-query hook; zero feature deps; no barrel consumers; 1 violation eliminated |
| DONE | `src/hooks/useConversationHistory/index.ts` | `2,9` + `shared/lib/aggregateEntries.ts:1` | legacy (hooks) + shared | `types` + `useConversationHistoryOld` from `@/features/workspace-chat` | `legacy -> features`, `shared -> features` | A2 | Moved `useConversationHistory/` directory (types, constants, useConversationHistoryOld) to `src/shared/hooks/useConversationHistory/`, deleted legacy shim, repointed 6 consumers, removed stale re-exports from feature file | claude | Pure types + hook; all deps shared-level; also fixed transitive relative imports in features; 3 violations eliminated |
| DONE | `src/shared/hooks/useCreateModeState.ts` | `17` | shared | `@/integrations/electric/hooks` | `shared -> integrations` | A3 | Extracted `CreateModeInitialState` + `LinkedIssue` types to `src/shared/types/createMode.ts`, moved `useCreateModeState.ts` from `shared/hooks/` to legacy `hooks/` (can import integrations), repointed 3 consumers | claude | Shared layer cannot import integrations; hook uses `useShape` from Electric; types extracted to shared for cross-layer access; 1 violation eliminated; **ZERO violations remaining** |
| DONE | `src/app/entry/App.tsx` | `4` | app | `@/contexts/ClickedElementsProvider` | `app -> legacy (contexts)` | A5 | Moved `ClickedElementsProvider.tsx` from `contexts/` to `app/providers/`, repointed `@/utils/previewBridge` → `@/shared/lib/previewBridge` inside it, updated import in `App.tsx` | claude | App-level orchestration provider (wraps entire router); only 1 consumer; also fixed transitive legacy dep on `@/utils/previewBridge`; 2 violations eliminated |

## Example Entry

| Status | File | Line | Importer Layer | Imported Module | Violation Type | Decision (A1-A5) | Action Summary | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DONE | `src/features/command-bar/ui/actions/useActionVisibility.ts` | `8` | feature | `@/features/workspace-chat/model/store/useDiffViewStore` | `features -> features` | A2 | Move `useDiffViewStore` to `src/shared/stores` and repoint imports |  | Cross-cutting UI state |

## Definition Of Done (Per Issue)

- The targeted issue is resolved in `pnpm run web:lint`.
- No new boundary violations introduced.
- Imports point to owning layer (not convenience aliases).
- Behavior unchanged (run relevant checks/tests).
