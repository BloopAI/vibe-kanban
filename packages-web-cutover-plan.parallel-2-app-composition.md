# Packages Web Cutover Plan: Parallel Track 2 (App Composition And Journeys)

## Goal
Finish non-shim migration of app composition, routing, and high-level journey wiring.

## Scope
Only non-shim implementation files.

Owned paths:
- `packages/web/src/app/**`
- `packages/web/src/pages/{migrate,root,workspaces}/**`
- `packages/web/src/features/migration/**`
- `packages/web/src/features/onboarding/**`
- `packages/web/src/features/command-bar/ui/actions/**`
- `packages/web/src/contexts/{ClickedElementsProvider.tsx,PortalContainerContext.tsx,ReviewProvider.tsx,SyncErrorContext.tsx}`

## Out Of Scope
- Any facade/shim-only files (re-export wrappers).
- Workspace runtime domain files from Track 1.
- API/auth/org data infrastructure from Track 3.

## Conflict Boundary
Do not edit files owned by Track 1 or Track 3.

## Execution Rules
- Do not modify shim-only files.
- Keep provider, router, and page orchestration logic in `app/*` and `pages/*`.
- Keep migration and onboarding implementation inside their feature folders.

## Task List
### T2.1 App Entry And Provider Composition
Task:
- Clean and lock provider composition responsibilities in `app/entry/*` and `app/providers/*`.

Completion criteria:
- Provider ordering is intentional and documented in code comments where needed.
- Pages do not re-own global provider responsibilities.
- `pnpm run web:check` passes.

### T2.2 Router And Page Ownership Cleanup
Task:
- Keep route composition in `app/router/*` and page orchestration in `pages/{migrate,root,workspaces}/*`.

Completion criteria:
- Pages are thin orchestration layers that delegate implementation to features.
- Root redirect and workspace landing routes still resolve correctly.
- `pnpm run web:lint` passes.

### T2.3 Migration And Onboarding Journey Wiring
Task:
- Ensure onboarding and migration flows are consistently wired through feature modules.

Completion criteria:
- Onboarding landing and sign-in pages render through `features/onboarding/*`.
- Migration journey pages render through `features/migration/*`.
- Flow behavior is unchanged based on manual verification.

### T2.4 Command Bar Action Ownership
Task:
- Keep command bar action definitions in `features/command-bar/ui/actions/*` and consume from stable exports.

Completion criteria:
- Action page definitions live in feature action files only.
- No duplicate action-definition logic in app/pages files.
- `rg -n "from '@/features/command-bar/ui/actions" packages/web/src` output matches expected consumers.

### T2.5 Journey Verification
Task:
- Run smoke checks for app-level journeys affected by this track.

Completion criteria:
- Root redirect works.
- Onboarding flow works.
- Migration flow works.
- Workspace landing flow works.
- Verification notes are included in PR description.

## Validation
Run:
- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:
- `rg -n "from '@/components/ui-new/containers|from '@/pages/ui-new" packages/web/src/app packages/web/src/pages packages/web/src/features/migration packages/web/src/features/onboarding`
- `rg -n "from '@/features/command-bar/ui/actions" packages/web/src`

## Definition Of Done
- T2.1 through T2.5 are complete.
- Validation commands pass on the branch head.
- Only Track 2 owned files and necessary callsites were changed.
