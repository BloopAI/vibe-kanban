# Packages Web Cutover Plan: Parallel Track 1 (Workspace Runtime)

## Goal
Stabilize and finish non-shim runtime migration for workspace, workspace chat, and kanban behavior.

## Scope
Only non-shim implementation files.

Owned paths:
- `packages/web/src/features/workspace/**`
- `packages/web/src/features/workspace-chat/**`
- `packages/web/src/features/kanban/**`
- `packages/web/src/contexts/{ActionsContext.tsx,ChangesViewContext.tsx,CreateModeContext.tsx,GitOperationsContext.tsx,LogsPanelContext.tsx,TabNavigationContext.tsx,TerminalContext.tsx,WorkspaceContext.tsx}`
- `packages/web/src/hooks/{useContextBarPosition.ts,useGitOperations.ts,useOpenInEditor.ts,usePrComments.ts,usePreviewNavigation.ts,usePreviewSettings.ts,usePreviewUrl.ts}`

## Out Of Scope
- Any facade/shim-only files (re-export wrappers).
- `packages/web/src/app/**`
- `packages/web/src/pages/**`
- `packages/web/src/lib/{api.ts,remoteApi.ts,modals.ts}`
- Auth/org infrastructure files.

## Conflict Boundary
Do not edit files owned by Track 2 or Track 3.

## Execution Rules
- Do not modify shim-only files.
- Prefer edits in owned paths first, then update only required callsites.
- Keep behavior unchanged unless explicitly documented in PR notes.

## Task List
### T1.1 Workspace Runtime Ownership Pass
Task:
- Ensure workspace runtime logic lives in `features/workspace/**` model or UI files.

Completion criteria:
- No new workspace runtime logic is added to root-level wrapper files.
- Any edited runtime behavior file is inside owned paths.
- `pnpm run web:check` passes.

### T1.2 Workspace Chat Runtime Ownership Pass
Task:
- Consolidate chat runtime logic in `features/workspace-chat/**` model/UI files.

Completion criteria:
- Chat retry/reset/send/message-edit flows resolve through `features/workspace-chat/model/hooks/*`.
- Chat state contexts resolve through `features/workspace-chat/model/contexts/*`.
- `pnpm run web:lint` passes.

### T1.3 Kanban Runtime Ownership Pass
Task:
- Keep kanban filtering/navigation and runtime UI logic in `features/kanban/**`.

Completion criteria:
- Kanban UI runtime uses `features/kanban/model/hooks/*` for stateful behavior.
- No new kanban runtime behavior is added outside owned paths.
- Workspace and kanban pages still render and navigate.

### T1.4 Root Hook And Context Drift Reduction
Task:
- Reduce remaining runtime imports in workspace domains that point at legacy root runtime wrappers.

Completion criteria:
- For workspace runtime files, imports prefer feature-local modules when equivalents exist.
- Command returns a reviewed set with no unexpected drift:
- `rg -n "from '@/hooks/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`
- `rg -n "from '@/contexts/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`

### T1.5 Runtime Behavior Verification
Task:
- Verify key runtime user journeys did not regress.

Completion criteria:
- Workspace open/load flow works.
- Session send/retry/edit/reset flow works.
- Kanban filter/navigation flow works.
- Verification notes are included in PR description.

## Validation
Run:
- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:
- `rg -n "from '@/hooks/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`
- `rg -n "from '@/contexts/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`

## Definition Of Done
- T1.1 through T1.5 are complete.
- Validation commands pass on the branch head.
- Only Track 1 owned files and necessary callsites were changed.
