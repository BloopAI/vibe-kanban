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

## Work Plan
1. API client boundary hardening.
- Keep backend interaction logic centralized in `lib/api.ts` and `lib/remoteApi.ts`.
- Remove domain leakage from auth/org hooks into unrelated UI layers.

2. Auth hook ownership cleanup.
- Keep auth state/query/mutation behavior inside `hooks/auth/*`.
- Ensure consumers import from stable auth hook entry points.

3. Organization hook and remote context alignment.
- Keep org querying/mutations and selection logic in org hooks.
- Keep remote user/org/project/issue context behavior consistent and self-contained.

4. Modal infrastructure stability pass.
- Keep modal contract/types in `lib/modals.ts`.
- Ensure infra-level modal usage patterns stay consistent and typed.

## Validation
Run:
- `pnpm run web:check`
- `pnpm run web:lint`

Sanity grep:
- `rg -n "from '@/lib/api|from '@/lib/remoteApi|from '@/hooks/auth|from '@/hooks/useOrganization|from '@/contexts/remote" packages/web/src`
- `rg -n "from '@/features/workspace|from '@/features/workspace-chat|from '@/features/kanban" packages/web/src/hooks/auth packages/web/src/hooks/useOrganization* packages/web/src/contexts/remote`

## Definition Of Done
- Data/auth/org infra files compile and lint clean.
- Auth and org flows behave the same from UI perspective.
- No new infra logic is introduced into shim/facade layers.
