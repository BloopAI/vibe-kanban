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
| Task ID | Objective | Detailed Breakdown | Primary File Scope | Verification Commands | Completion Criteria |
| --- | --- | --- | --- | --- | --- |
| T2.1 | App entry and provider composition | 1. Audit `app/entry/*` and `app/providers/*` for provider order, scope, and ownership.<br>2. Keep global providers centralized at app entry and remove any newly found page-level provider duplication.<br>3. Add concise comments only where provider order is non-obvious.<br>4. Ensure provider wiring remains deterministic across routes. | `packages/web/src/app/entry/**`, `packages/web/src/app/providers/**` | `pnpm run web:check` | Provider composition is centralized in app entry/providers, no page-level re-ownership appears, and typecheck passes. |
| T2.2 | Router and page ownership cleanup | 1. Keep route orchestration in `app/router/*` and page orchestration in `pages/{migrate,root,workspaces}/*`.<br>2. Ensure pages remain thin delegators into feature modules.<br>3. Remove route/page coupling that reaches into out-of-track internals.<br>4. Confirm route-level redirects and page mounting boundaries are unchanged. | `packages/web/src/app/router/**`, `packages/web/src/pages/migrate/**`, `packages/web/src/pages/root/**`, `packages/web/src/pages/workspaces/**` | `pnpm run web:lint` | Pages are orchestration-only, route behavior is unchanged, and lint passes. |
| T2.3 | Migration and onboarding journey wiring | 1. Verify `pages/*` call into `features/migration/*` and `features/onboarding/*` consistently.<br>2. Remove any duplicate journey logic outside those features.<br>3. Keep journey state transitions in feature modules and page wrappers thin.<br>4. Validate route-to-feature handoff for each journey entry point. | `packages/web/src/features/migration/**`, `packages/web/src/features/onboarding/**`, related `pages/*` callsites | `pnpm run web:check && pnpm run web:lint` | Onboarding and migration flows are feature-owned with unchanged behavior and passing checks. |
| T2.4 | Command-bar action ownership | 1. Keep action definition sources in `features/command-bar/ui/actions/*`.<br>2. Ensure consumers import stable feature action exports rather than redefining action metadata.<br>3. Remove accidental duplicate action configuration in app/pages layers.<br>4. Capture post-change import surface in PR notes. | `packages/web/src/features/command-bar/ui/actions/**`, app/pages consumers | `rg -n "from '@/features/command-bar/ui/actions" packages/web/src` | Action ownership is single-sourced in feature actions and consumer imports are clean and expected. |
| T2.5 | Journey verification | 1. Smoke test root redirect behavior.<br>2. Smoke test onboarding landing/sign-in flow.<br>3. Smoke test migration multistep flow.<br>4. Smoke test workspace landing flow.<br>5. Record exact runbook and outcomes for reviewers. | App entry points and page route surfaces in scope | Manual smoke checks + rerun `pnpm run web:check` and `pnpm run web:lint` after final rebase | All app-level journeys in scope work as before and verification evidence is documented. |

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
