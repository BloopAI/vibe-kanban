# Packages Web Cutover Plan: Parallel Track 3 (Data, Auth, Org Infrastructure)

## Goal

Finish non-shim infrastructure migration for data clients, auth state, and organization/remote context ownership.

## Scope

Only non-shim implementation files.

Owned paths:

- `packages/web/src/lib/{api.ts,remoteApi.ts,modals.ts}`
- `packages/web/src/hooks/auth/**`
- `packages/web/src/hooks/{organizationKeys.ts,useAllOrganizationProjects.ts,useUserOrganizations.ts,useOrganizationInvitations.ts,useOrganizationMembers.ts,useOrganizationMutations.ts,useOrganizationProjects.ts,useOrganizationSelection.ts}`
- `packages/web/src/contexts/remote/**`

## Out Of Scope

- Any facade/shim-only files (re-export wrappers).
- App/page composition files from Track 2.
- Workspace/chat/kanban runtime files from Track 1.

## Conflict Boundary

Do not edit files owned by Track 1 or Track 2.

## Execution Rules

- Do not modify shim-only files.
- Keep infra contracts stable while migrating ownership.
- Prefer mechanical import cleanups before behavior changes.

## Task List

| Task ID | Objective                       | Detailed Breakdown                                                                                                                                                                                                                                                                                                                                 | Primary File Scope                                                                                                                                                                                                                                                                                                                                                                                                                  | Verification Commands                                              | Completion Criteria                                                                                                  |
| ------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| T3.1    | API client boundary hardening   | 1. Audit `lib/api.ts` and `lib/remoteApi.ts` for domain leakage and inconsistent call contracts.<br>2. Keep backend and remote data access centralized in those two files.<br>3. Move any discovered ad-hoc API usage back behind existing client abstractions.<br>4. Preserve request/response typing and error handling behavior.                | `packages/web/src/lib/api.ts`, `packages/web/src/lib/remoteApi.ts`                                                                                                                                                                                                                                                                                                                                                                  | `pnpm run web:check`                                               | API access remains centralized, no new ad-hoc client surfaces are introduced, and typecheck passes.                  |
| T3.2    | Auth hook ownership cleanup     | 1. Consolidate auth state, mutation, and status flows under `hooks/auth/*`.<br>2. Ensure callers consume stable auth hook interfaces rather than implementation internals.<br>3. Remove duplicate auth derivation logic from non-auth infrastructure files.<br>4. Confirm auth side effects stay within owned auth hooks.                          | `packages/web/src/hooks/auth/**`, auth consumer callsites                                                                                                                                                                                                                                                                                                                                                                           | `pnpm run web:lint`                                                | Auth behavior is single-sourced under `hooks/auth/*`, consumers are stable, and lint passes.                         |
| T3.3    | Organization hook consolidation | 1. Consolidate org selection/membership/invitation/project operations in owned org hooks.<br>2. Ensure shared cache/query keys flow through `organizationKeys.ts` consistently.<br>3. Remove duplicate org query/mutation logic from UI/domain layers where found.<br>4. Confirm org state derivation is consistent across all in-scope consumers. | `packages/web/src/hooks/organizationKeys.ts`, `packages/web/src/hooks/useAllOrganizationProjects.ts`, `packages/web/src/hooks/useUserOrganizations.ts`, `packages/web/src/hooks/useOrganizationInvitations.ts`, `packages/web/src/hooks/useOrganizationMembers.ts`, `packages/web/src/hooks/useOrganizationMutations.ts`, `packages/web/src/hooks/useOrganizationProjects.ts`, `packages/web/src/hooks/useOrganizationSelection.ts` | `rg -n "from '@/hooks/useOrganization                              | from '@/hooks/organizationKeys" packages/web/src`                                                                    | Org logic is hook-owned, duplicate org logic is removed from out-of-scope layers, and import surface is reviewed. |
| T3.4    | Remote context alignment        | 1. Keep remote user/org/project/issue context ownership in `contexts/remote/*`.<br>2. Normalize context contracts and provider responsibilities without changing consumer behavior.<br>3. Remove cross-domain leakage into workspace/app tracks.<br>4. Capture context consumer set after cleanup.                                                 | `packages/web/src/contexts/remote/**`                                                                                                                                                                                                                                                                                                                                                                                               | `rg -n "from '@/contexts/remote" packages/web/src`                 | Remote contexts are self-contained, no unintended cross-track coupling is introduced, and consumer map is validated. |
| T3.5    | Modal contract stability        | 1. Keep modal contract typing centralized in `lib/modals.ts`.<br>2. Remove duplicate modal contract definitions if discovered.<br>3. Verify modal result/argument type usage remains consistent for infra consumers.<br>4. Document verification steps in PR notes for reviewers.                                                                  | `packages/web/src/lib/modals.ts` and infra callsites                                                                                                                                                                                                                                                                                                                                                                                | Manual contract review + `pnpm run web:check && pnpm run web:lint` | Modal contracts remain single-sourced, typed, and unchanged in behavior, with verification evidence documented.      |

## Validation

Run:

- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:

- `rg -n "from '@/lib/api|from '@/lib/remoteApi|from '@/hooks/auth|from '@/hooks/useOrganization|from '@/contexts/remote" packages/web/src`
- `rg -n "from '@/features/workspace|from '@/features/workspace-chat|from '@/features/kanban" packages/web/src/hooks/auth packages/web/src/hooks/useOrganization* packages/web/src/contexts/remote`

## Definition Of Done

- T3.1 through T3.5 are complete.
- Validation commands pass on the branch head.
- Only Track 3 owned files and necessary callsites were changed.
