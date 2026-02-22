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
### T3.1 API Client Boundary Hardening
Task:
- Stabilize data-client boundaries in `lib/api.ts` and `lib/remoteApi.ts`.

Completion criteria:
- API access paths remain centralized in these files.
- No new API calling surfaces are introduced in unrelated layers.
- `pnpm run web:check` passes.

### T3.2 Auth Hook Ownership Cleanup
Task:
- Keep authentication state and mutation/query logic fully owned by `hooks/auth/*`.

Completion criteria:
- Auth behavior remains sourced from `hooks/auth/*`.
- Consumers use stable auth hook entry points.
- `pnpm run web:lint` passes.

### T3.3 Organization Hook Consolidation
Task:
- Consolidate org selection/membership/project/invitation logic in the owned org hook files.

Completion criteria:
- Organization query/mutation logic is not duplicated in UI/domain files.
- Organization selection state is consistently derived from org hooks.
- `rg -n "from '@/hooks/useOrganization|from '@/hooks/organizationKeys" packages/web/src` shows expected consumers only.

### T3.4 Remote Context Alignment
Task:
- Keep remote user/org/project/issue context ownership in `contexts/remote/*`.

Completion criteria:
- Remote context state derivation and provider responsibilities are self-contained.
- No cross-domain runtime leakage into workspace/app ownership tracks.
- `rg -n "from '@/contexts/remote" packages/web/src` shows expected consumers only.

### T3.5 Modal Contract Stability
Task:
- Ensure `lib/modals.ts` remains the typed modal contract source for infrastructure-level usage.

Completion criteria:
- Modal argument/result contracts remain typed and consistent.
- No duplicate modal contract definitions are introduced.
- Verification notes are included in PR description.

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
