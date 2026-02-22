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
- [x] `T2.1.a` Move workspace-chat hook dependencies
      (`useConversationHistory`, `useResetProcess`) from
      `src/components/ui-new/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shims.
- [x] `T2.1.b` Move shared conversation-history constants/types from
      `src/hooks/useConversationHistory/**` into feature/shared model ownership
      with compatibility re-export facades.
- [ ] `T2.1.c` Repoint remaining legacy
      `src/hooks/useConversationHistory/types` import in `src/utils/**` once
      utils-path edits are in-scope.
- [x] `T2.1.d` Move workspace-chat `useTodos` hook from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shim.
- [x] `T2.1.e` Move workspace-chat `useSessionQueueInteraction` from
      `src/hooks/**` into `src/features/workspace-chat/model/hooks/**` with
      compatibility shim.
- [x] `T2.1.f` Move remaining workspace-chat session hooks
      (`useSessionSend`, `useSessionAttachments`, `useSessionMessageEditor`,
      `useMessageEditRetry`) into `src/features/workspace-chat/model/hooks/**`
      with compatibility shims.
- [x] `T2.1.f.a` Move `useSessionAttachments` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shim.
- [x] `T2.1.f.b` Move `useSessionSend` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shim.
- [x] `T2.1.f.c` Move `useSessionMessageEditor` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shim.
- [x] `T2.1.f.d` Move `useMessageEditRetry` into
      `src/features/workspace-chat/model/hooks/**` with compatibility shim.
- [x] `T2.1.g` Move shared `useWorkspaces` from
      `src/components/ui-new/hooks/**` into `src/hooks/**` with a
      compatibility shim.
- [x] `T2.1.h` Move remaining preview/workspace hooks
      (`usePreviewDevServer`, `usePreviewUrl`) out of
      `src/components/ui-new/hooks/**` into canonical hook ownership with
      compatibility shims.
- [x] `T2.1.h.a` Move `usePreviewDevServer` out of
      `src/components/ui-new/hooks/**` into `src/hooks/**` with a
      compatibility shim.
- [x] `T2.1.h.b` Move `usePreviewUrl` out of
      `src/components/ui-new/hooks/**` into `src/hooks/**` with a
      compatibility shim.
- [x] `T2.1.i` Move `useExecutionProcesses` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.j` Move `useRetryProcess` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.k` Move `useCreateSession` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.l` Move `useAttemptBranch` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.m` Move `useApprovalMutation` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.n` Move `useAttemptExecution` from `src/hooks/**` into
      `src/features/workspace-chat/model/hooks/**` with a compatibility shim.
- [x] `T2.1.o` Move `useAttemptRepo` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.p` Move `useAttempt` (and `attemptKeys`) from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.q` Move `useBranchStatus` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.r` Move `useRenameBranch` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.s` Move `usePush` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.t` Move `useMerge` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.u` Move `useRebase` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.v` Move `useForcePush` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.w` Move `useChangeTargetBranch` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.x` Move `useAttemptConflicts` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.y` Move `useRepoBranches` (and `repoBranchKeys`) from
      `src/hooks/**` into `src/features/workspace/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.z` Move `useRepoBranchSelection` (and `RepoBranchConfig`) from
      `src/hooks/**` into `src/features/workspace/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.aa` Move `useWorkspaceSessions` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ab` Move `useTaskAttempt` / `useTaskAttemptWithSession` from
      `src/hooks/**` into `src/features/workspace/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.ac` Move `useTaskAttempts` family
      (`useTaskAttemptsWithSessions`, `taskAttemptKeys`) from `src/hooks/**`
      into `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ad` Move `useWorkspaceNotes` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ae` Move `useCreateWorkspace` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.af` Move `useWorkspaceCreateDefaults` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ag` Move `useProjects` from `src/hooks/**` into
      `src/features/migration/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ah` Move `useProjectWorkspaceCreateDraft` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.ai` Move `useKanbanNavigation` from `src/hooks/**` into
      `src/features/kanban/model/hooks/**` with a compatibility shim.
- [x] `T2.1.aj` Move `useKanbanFilters` (and `PRIORITY_ORDER`) from
      `src/hooks/**` into `src/features/kanban/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.ak` Move `useCreateModeState` (and `CreateModeInitialState`) from
      `src/hooks/**` into `src/features/workspace/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.al` Move `useWorkspaces` (and `workspaceSummaryKeys`) from
      `src/hooks/**` into `src/features/workspace/model/hooks/**` with a
      compatibility shim.
- [x] `T2.1.am` Move `useDevServer` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [x] `T2.1.an` Move `usePreviewDevServer` from `src/hooks/**` into
      `src/features/workspace/model/hooks/**` with a compatibility shim.
- [ ] `T2.2` Consolidate duplicated hook families (conversation history,
      workspace/session variants, etc.).
- [x] `T2.2.a` Move legacy `useConversationHistoryOld` implementation into
      `src/features/workspace-chat/model/hooks/useConversationHistory/**`
      while preserving legacy `src/hooks/useConversationHistory/**` facades.
- [ ] `T2.2.b` Evaluate merge strategy between `useConversationHistoryOld` and
      canonical `useConversationHistory` after downstream imports migrate.
- [x] `T2.3` Move contexts to owning feature/entity model folders where
      practical, keeping app-level providers only where truly global.
- [x] `T2.3.a` Move workspace-chat `MessageEditContext` from
      `src/contexts/**` into
      `src/features/workspace-chat/model/contexts/**` with a compatibility
      shim.
- [x] `T2.3.b` Evaluate relocation strategy for remaining workspace-chat-heavy
      contexts (`EntriesContext`) while preserving feature-boundary import
      constraints.
- [x] `T2.3.c` Move workspace-chat `ApprovalFeedbackContext` from
      `src/contexts/**` into
      `src/features/workspace-chat/model/contexts/**` with a compatibility
      shim.
- [x] `T2.3.d` Move workspace-chat `EntriesContext` from `src/contexts/**`
      into `src/features/workspace-chat/model/contexts/**` with a
      compatibility shim.
- [x] `T2.3.e` Move workspace-chat `RetryUiContext` from `src/contexts/**`
      into `src/features/workspace-chat/model/contexts/**` with a
      compatibility shim.
- [x] `T2.3.f` Move workspace-chat `ApprovalFormContext` from
      `src/contexts/**` into
      `src/features/workspace-chat/model/contexts/**` with a compatibility
      shim.
- [x] `T2.3.g` Move workspace-chat `ExecutionProcessesContext` from
      `src/contexts/**` into
      `src/features/workspace-chat/model/contexts/**` with a compatibility
      shim.
- [x] `T2.3.h` Move workspace-chat `ProcessSelectionContext` from
      `src/contexts/**` into
      `src/features/workspace-chat/model/contexts/**` with a compatibility
      shim.
- [x] `T2.4` Move stores to `features/*/model/store` or `shared/stores`.
- [x] `T2.4.a` Move workspace-chat `useTaskDetailsUiStore` from
      `src/stores/**` into `src/features/workspace-chat/model/store/**` with a
      compatibility shim.
- [x] `T2.4.b` Classify and migrate remaining global stores
      (`useUiPreferencesStore`) into feature- or shared-owned locations with
      compatibility shims.
- [x] `T2.4.b.a` Move workspace-chat `useInspectModeStore` from
      `src/stores/**` into `src/features/workspace-chat/model/store/**` with a
      compatibility shim.
- [x] `T2.4.b.b` Move workspace-chat `useExpandableStore` from
      `src/stores/**` into `src/features/workspace-chat/model/store/**` with a
      compatibility shim.
- [x] `T2.4.b.c` Move workspace-chat `useDiffViewStore` from `src/stores/**`
      into `src/features/workspace-chat/model/store/**` with a compatibility
      shim.
- [x] `T2.4.b.d` Move global `useOrganizationStore` from `src/stores/**` into
      `src/shared/stores/**` with a compatibility shim.
- [x] `T2.4.b.e` Move global `useUiPreferencesStore` from `src/stores/**`
      into `src/shared/stores/**` with a compatibility shim.
- [ ] `T2.5` Minimize provider depth by localizing provider trees to feature
      boundaries when possible.
- [ ] `T2.6` Keep compatibility shims at legacy hook/context/store paths until
      final consolidation.
- [ ] `T2.6.a` Repoint remaining out-of-scope shim consumers for
      `useUiPreferencesStore` (`src/components/ui-new/actions/**`,
      `src/components/ui-new/dialogs/KanbanFiltersDialog.tsx`) once those
      paths are in-scope.
- [ ] `T2.6.b` Repoint remaining cross-feature shim consumer for
      `RetryUiContext` (`src/features/workspace/ui/VSCodeWorkspacePage.tsx`)
      when feature-boundary rules allow direct feature-model imports.
- [ ] `T2.6.c` Repoint remaining shim consumers for
      `ExecutionProcessesContext`
      (`src/features/workspace/ui/WorkspacesLayout.tsx`,
      `src/components/ui-new/actions/useActionVisibility.ts`,
      `src/components/dialogs/tasks/GitActionsDialog.tsx`) when feature
      boundaries and out-of-scope paths permit.
- [ ] `T2.6.d` Repoint remaining out-of-scope shim consumer for
      `ProcessSelectionContext`
      (`src/components/dialogs/tasks/ViewProcessesDialog.tsx`) when dialog
      paths are in-scope.
- [ ] `T2.6.e` Repoint remaining out-of-scope shim consumers for
      `useWorkspaces` (`src/components/ui-new/actions/index.ts`,
      `src/components/ui-new/dialogs/RebaseDialog.tsx`) once those paths are
      in-scope.
- [ ] `T2.6.f` Repoint remaining out-of-scope shim consumers for
      `useExecutionProcesses`
      (`src/components/dialogs/scripts/ScriptFixerDialog.tsx`,
      `src/components/ui-new/dialogs/ResolveConflictsDialog.tsx`) once dialog
      paths are in-scope.
- [ ] `T2.6.g` Repoint remaining out-of-scope shim consumer for
      `useAttemptExecution` (`src/components/dialogs/tasks/GitActionsDialog.tsx`)
      once dialog paths are in-scope.
- [ ] `T2.6.h` Repoint remaining shim consumers for `useAttemptRepo`
      (`src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`,
      `src/components/dialogs/tasks/GitActionsDialog.tsx`,
      `src/components/ui-new/dialogs/RebaseDialog.tsx`) when feature
      boundaries and out-of-scope paths permit.
- [ ] `T2.6.i` Repoint remaining out-of-scope shim consumers for `useAttempt`
      / `attemptKeys`
      (`src/components/ui-new/actions/index.ts`,
      `src/components/ui-new/dialogs/CommandBarDialog.tsx`,
      `src/components/ui-new/dialogs/RebaseDialog.tsx`) once those paths are
      in-scope.
- [ ] `T2.6.j` Repoint remaining shim consumers for `useBranchStatus`
      (`src/features/workspace-chat/model/hooks/useResetProcess.ts`,
      `src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`,
      `src/components/ui-new/actions/useActionVisibility.ts`,
      `src/components/ui-new/dialogs/RebaseDialog.tsx`,
      `src/components/dialogs/tasks/GitActionsDialog.tsx`) when feature
      boundaries and out-of-scope paths permit.
- [ ] `T2.6.k` Repoint remaining out-of-scope shim consumer for
      `useRenameBranch` (`src/components/dialogs/tasks/EditBranchNameDialog.tsx`)
      once dialog paths are in-scope.
- [ ] `T2.6.l` Repoint remaining out-of-scope shim consumer for
      `useForcePush` (`src/components/dialogs/git/ForcePushDialog.tsx`) once
      dialog paths are in-scope.
- [ ] `T2.6.m` Repoint remaining out-of-scope shim consumers for
      `useRepoBranches` / `repoBranchKeys`
      (`src/components/ui-new/actions/index.ts`,
      `src/components/ui-new/dialogs/RebaseDialog.tsx`,
      `src/components/ui-new/dialogs/settings/ReposSettingsSection.tsx`) once
      action/dialog paths are in-scope.
- [ ] `T2.6.n` Repoint remaining feature-boundary shim consumers for
      `repoBranchKeys`
      (`src/features/workspace/model/hooks/useRebase.ts`,
      `src/features/workspace/model/hooks/useMerge.ts`,
      `src/features/workspace/model/hooks/useChangeTargetBranch.ts`,
      `src/features/workspace/model/hooks/useRepoBranchSelection.ts`) after
      layer-boundary rules permit direct feature-model imports.
- [ ] `T2.6.o` Repoint remaining out-of-scope shim consumer for
      `useTaskAttemptWithSession`
      (`src/components/dialogs/tasks/GitActionsDialog.tsx`) once dialog paths
      are in-scope.
- [ ] `T2.6.p` Repoint remaining feature-boundary shim consumer for
      `useExecutionProcesses`
      (`src/features/workspace/model/hooks/useWorkspaceCreateDefaults.ts`)
      after layer-boundary rules permit direct feature-model imports.
- [ ] `T2.6.q` Repoint remaining out-of-scope shim consumer for
      `useProjectWorkspaceCreateDraft`
      (`src/components/ui-new/dialogs/WorkspaceSelectionDialog.tsx`) once
      dialog paths are in-scope.
- [ ] `T2.6.r` Repoint remaining feature-boundary shim consumer for
      `useKanbanNavigation`
      (`src/features/workspace/model/hooks/useProjectWorkspaceCreateDraft.ts`)
      after layer-boundary rules permit direct feature-model imports.
- [ ] `T2.6.s` Repoint remaining out-of-scope shim consumer for
      `useCreateModeState` / `CreateModeInitialState`
      (`src/lib/workspaceCreateState.ts`) once `src/lib/**` edits are in-scope.
- [ ] `T2.6.t` Repoint remaining feature-boundary shim consumer for
      `useWorkspaces` / `workspaceSummaryKeys`
      (`src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`) after
      layer-boundary rules permit direct feature-model imports.
- [ ] `T2.6.u` Repoint remaining out-of-scope shim consumer for `useDevServer`
      (`src/components/ui-new/actions/useActionVisibility.tsx`) once
      `src/components/ui-new/actions/**` edits are in-scope.

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
