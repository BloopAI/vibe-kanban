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

## Work Plan
1. Align runtime ownership boundaries.
- Ensure workspace/chat/kanban state and side effects are owned by feature `model` and `ui` files.
- Remove remaining runtime coupling to legacy root-layer implementation files.

2. Normalize context and hook usage inside runtime domain.
- Prefer feature-local model hooks and contexts in workspace/chat/kanban implementations.
- Keep root contexts/hooks only where they are still canonical implementation, not as pass-through layer usage.

3. Reduce cross-domain dependencies.
- Minimize direct imports from unrelated domains inside workspace runtime files.
- Keep imports focused on `features/workspace*`, `features/kanban`, `shared/*`, and required `app/*` primitives.

4. Verify behavior invariants.
- Workspace open/load flows.
- Session/chat send and retry flows.
- Kanban filter/navigation flows.

## Validation
Run:
- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:
- `rg -n "from '@/hooks/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`
- `rg -n "from '@/contexts/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`

## Definition Of Done
- Workspace/chat/kanban runtime files compile and lint clean.
- No new runtime logic added to shim/facade layers.
- Runtime domain behavior matches current UI behavior.
