# App Navigation Hard Migration Plan

## Objective
Eliminate the `any`-based navigation contract by replacing route-object-returning
APIs with a router-agnostic semantic navigation interface, implemented by local
and remote adapters.

## Design Principles
1. `web-core` owns navigation semantics, not router targets.
2. Local and remote own route mapping to TanStack route trees.
3. No compatibility layer.
4. No explicit `any` in navigation code.
5. One shared path parser source of truth.

## Target Architecture
1. Shared semantic destination model in `web-core`.
2. Shared path parsing from URL to semantic destination.
3. App-specific adapters:
   - local adapter: semantic destination -> local typed route
   - remote adapter: semantic destination -> remote typed route (host-aware)
4. `useAppNavigation` exposes imperative methods (`goTo*`, `resolveFromPath`)
   instead of returning route objects.

## Shared Semantic Destination Model
Define one destination union in
`packages/web-core/src/shared/lib/routes/appNavigation.ts`:

```ts
export type KanbanSearch = {
  statusId?: string;
  priority?: string;
  assignees?: string;
  parentIssueId?: string;
  mode?: string;
  orgId?: string;
};

export type AppDestination =
  | { kind: 'root' }
  | { kind: 'onboarding' }
  | { kind: 'onboarding-sign-in' }
  | { kind: 'migrate' }
  | { kind: 'workspaces' }
  | { kind: 'workspaces-create' }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'workspace-vscode'; workspaceId: string }
  | { kind: 'project'; projectId: string; search?: KanbanSearch }
  | { kind: 'project-issue-create'; projectId: string; search?: KanbanSearch }
  | {
      kind: 'project-issue';
      projectId: string;
      issueId: string;
      search?: KanbanSearch;
    }
  | {
      kind: 'project-issue-workspace';
      projectId: string;
      issueId: string;
      workspaceId: string;
      search?: KanbanSearch;
    }
  | {
      kind: 'project-issue-workspace-create';
      projectId: string;
      issueId: string;
      draftId: string;
      search?: KanbanSearch;
    }
  | {
      kind: 'project-workspace-create';
      projectId: string;
      draftId: string;
      search?: KanbanSearch;
    };

export type NavigationTransition = {
  replace?: boolean;
  state?: unknown;
};

export interface AppNavigation {
  navigate(destination: AppDestination, transition?: NavigationTransition): void;
  resolveFromPath(path: string): AppDestination | null;
}
```

Notes:
1. `AppDestination` has no router-specific fields (`to`, `params`, `search`
   objects tied to TanStack API shape).
2. Host scoping is adapter context in remote, not part of shared destination.
3. URL parsing keeps query support (`KanbanSearch`) in shared code.
4. Destination construction helpers may be added, but they must return
   `AppDestination` only.

## Migration Phases

### Phase 1: Shared Contract and Parsing
1. Replace route-object API in
   `packages/web-core/src/shared/lib/routes/appNavigation.ts`.
2. Introduce `AppDestination`, `KanbanSearch`, and `NavigationTransition`.
3. Replace `resolveAppNavigationFromPath` to return semantic destination only.
4. Consolidate duplicate parsing between:
   - `packages/web-core/src/shared/lib/routes/appNavigation.ts`
   - `packages/web-core/src/shared/lib/routes/projectSidebarRoutes.ts`
5. Keep host-aware parsing behavior in shared parser.

### Phase 2: Provider Interface
1. Update `packages/web-core/src/shared/hooks/useAppNavigation.ts` provider
   types to the new imperative contract.
2. Remove legacy `toX()` route-object signatures and keep only semantic
   methods (`navigate`, `resolveFromPath`, optional typed convenience wrappers
   returning `AppDestination`).

### Phase 3: Local Adapter
1. Update `packages/local-web/src/app/navigation/AppNavigation.ts` to
   implement the new contract.
2. Use local typed TanStack route mapping without casts.
3. Keep `packages/local-web/src/app/entry/App.tsx` as wiring only.
4. Enforce exhaustive `switch(destination.kind)` in local adapter.

### Phase 4: Remote Adapter
1. Update `packages/remote-web/src/app/navigation/AppNavigation.ts` to
   implement the new contract.
2. Keep host-scoped and fallback behavior in remote package.
3. Keep `packages/remote-web/src/routes/__root.tsx` as wiring only.
4. Enforce exhaustive `switch(destination.kind)` in remote adapter.

### Phase 5: Consumer Migration
Migrate all `useAppNavigation` consumers from `navigate(appNavigation.toX())`
and spread patterns (`...appNavigation.toX()`) to imperative calls.

Primary files:
- `packages/web-core/src/pages/root/RootRedirectPage.tsx`
- `packages/web-core/src/features/onboarding/ui/OnboardingSignInPage.tsx`
- `packages/web-core/src/features/migration/ui/MigrateChooseProjectsContainer.tsx`
- `packages/web-core/src/features/migration/ui/MigrateFinishContainer.tsx`
- `packages/web-core/src/features/migration/ui/MigrateLayout.tsx`
- `packages/web-core/src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`
- `packages/web-core/src/pages/kanban/IssueWorkspacesSectionContainer.tsx`
- `packages/web-core/src/pages/kanban/ProjectKanban.tsx`
- `packages/web-core/src/pages/kanban/ProjectRightSidebarContainer.tsx`
- `packages/web-core/src/pages/workspaces/WorkspacesLanding.tsx`
- `packages/web-core/src/pages/workspaces/WorkspacesLayout.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/NavbarContainer.tsx`
- `packages/web-core/src/shared/components/ui-new/containers/SharedAppLayout.tsx`
- `packages/web-core/src/shared/dialogs/command-bar/CreateWorkspaceFromPrDialog.tsx`
- `packages/web-core/src/shared/dialogs/command-bar/WorkspaceSelectionDialog.tsx`
- `packages/web-core/src/shared/hooks/useKanbanNavigation.ts`
- `packages/web-core/src/shared/hooks/usePreviousPath.ts`
- `packages/web-core/src/shared/providers/ActionsProvider.tsx`
- `packages/web-core/src/shared/providers/WorkspaceProvider.tsx`
- `packages/remote-web/src/app/providers/RemoteActionsProvider.tsx`
- `packages/web-core/src/shared/actions/index.ts`
- `packages/web-core/src/shared/types/actions.ts`

### Phase 6: Remove String Round-Trips
1. Update `packages/web-core/src/shared/lib/firstProjectDestination.ts` to
   return semantic destination data instead of raw `'/projects/:id'` strings.
2. Update callers in root/onboarding flows to avoid parse-then-resolve loops.

### Phase 7: Cleanup and Guardrails
1. Delete legacy route-object helpers and any dead parser wrappers.
2. Remove all `as any` navigation casts.
3. Add lint/typing guardrails for navigation modules to prevent explicit `any`.

### Phase 8: Validation
Run:
1. `pnpm --filter @vibe/web-core run check`
2. `pnpm --filter @vibe/local-web run check`
3. `pnpm --filter @vibe/remote-web run check`
4. `pnpm run format`

## Risk Areas to Verify During Migration
1. `replace` and `state` behavior currently encoded via spread-to-navigate
   patterns.
2. Remembered-path restoration in `SharedAppLayout`.
3. Host-scoped routing behavior in remote when switching host context.
4. Onboarding/root redirect flows that currently rely on string destinations.
5. Project sidebar route derivation after parser consolidation.
