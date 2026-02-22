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

| Task ID | Objective                             | Detailed Breakdown                                                                                                                                                                                                                                                                                                                           | Primary File Scope                                                                                                                                                        | Verification Commands                                                                                                                                                                                                                                                               | Completion Criteria                                                                                                  |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| T1.1    | Workspace runtime ownership pass      | 1. Inventory runtime logic in `features/workspace/model/hooks/*` and `features/workspace/ui/*`.<br>2. Move any newly discovered runtime side effects to feature-owned modules (not root wrappers).<br>3. Keep callsite updates minimal and scoped to runtime entry points.<br>4. Record any unavoidable cross-domain dependency in PR notes. | `packages/web/src/features/workspace/**`                                                                                                                                  | `pnpm run web:check`                                                                                                                                                                                                                                                                | Workspace runtime behavior is owned by feature modules, no new root-layer runtime logic added, and typecheck passes. |
| T1.2    | Workspace chat runtime ownership pass | 1. Audit retry/reset/send/edit/chat-queue logic in `features/workspace-chat/model/hooks/*`.<br>2. Ensure state contexts flow through `features/workspace-chat/model/contexts/*`.<br>3. Remove or avoid duplicate runtime behavior outside this feature.<br>4. Validate all touched chat components still compile against model contracts.    | `packages/web/src/features/workspace-chat/**`                                                                                                                             | `pnpm run web:lint`                                                                                                                                                                                                                                                                 | Chat runtime paths are feature-owned, no duplicate chat runtime logic introduced elsewhere, and lint passes.         |
| T1.3    | Kanban runtime ownership pass         | 1. Confirm filters/navigation state comes from `features/kanban/model/hooks/*`.<br>2. Keep UI orchestration in `features/kanban/ui/*` and avoid leaking logic into unrelated containers.<br>3. Verify task board behavior still maps to the same query/filter state transitions.<br>4. Update only required import callsites.                | `packages/web/src/features/kanban/**`                                                                                                                                     | `pnpm run web:check && pnpm run web:lint`                                                                                                                                                                                                                                           | Kanban runtime behavior remains feature-owned, no out-of-scope logic drift, and check/lint both pass.                |
| T1.4    | Root hook/context drift reduction     | 1. Scan workspace runtime domains for legacy root hook/context imports.<br>2. Replace with feature-local modules where equivalent implementations exist.<br>3. Leave imports unchanged only when root module is canonical implementation.<br>4. Produce grep output in PR notes to show resulting import surface.                            | `packages/web/src/features/workspace/**`, `packages/web/src/features/workspace-chat/**`, `packages/web/src/features/kanban/**`, owned root contexts/hooks listed in scope | `rg -n "from '@/hooks/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban`<br>`rg -n "from '@/contexts/" packages/web/src/features/workspace packages/web/src/features/workspace-chat packages/web/src/features/kanban` | Import drift is reduced with no unexpected dependency jumps and grep output is reviewed/documented.                  |
| T1.5    | Runtime behavior verification         | 1. Smoke test workspace open/load and workspace switching.<br>2. Smoke test session send/retry/edit/reset paths.<br>3. Smoke test kanban filter and navigation flows.<br>4. Document exact test actions and outcomes in PR notes for reviewer replay.                                                                                        | Runtime entry points in `features/workspace/ui/*`, `features/workspace-chat/ui/*`, `features/kanban/ui/*`                                                                 | Manual smoke checks + rerun `pnpm run web:check` and `pnpm run web:lint` after final rebase                                                                                                                                                                                         | All three runtime journeys work as before, and verification evidence is captured in PR notes.                        |

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
