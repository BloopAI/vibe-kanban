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

## Work Plan
1. App shell and provider composition cleanup.
- Confirm provider order and scope in `app/entry` and `app/providers`.
- Keep provider responsibilities in `app/*`, not scattered in pages.

2. Router and page-flow ownership cleanup.
- Keep route/page orchestration in `app/router` and `pages/*`.
- Keep feature-specific implementation in `features/migration` and `features/onboarding`.

3. Command bar action wiring cleanup.
- Ensure command-bar action definitions stay in feature action modules.
- Keep page/app usage consuming those actions through stable feature exports.

4. Journey-level behavior checks.
- Root redirect and workspace landing.
- Onboarding landing/sign-in flow.
- Migration multi-step flow.

## Validation
Run:
- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:
- `rg -n "from '@/components/ui-new/containers|from '@/pages/ui-new" packages/web/src/app packages/web/src/pages packages/web/src/features/migration packages/web/src/features/onboarding`
- `rg -n "from '@/features/command-bar/ui/actions" packages/web/src`

## Definition Of Done
- App/provider/router/page files compile and lint clean.
- Onboarding and migration journeys run with unchanged behavior.
- Command bar action wiring is owned by feature action modules and not duplicated.
