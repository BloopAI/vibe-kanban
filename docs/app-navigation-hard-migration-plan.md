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
6. No TanStack `Link` usage for app navigation in `web-core`.

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
export type AppDestination =
  | { kind: 'root' }
  | { kind: 'onboarding' }
  | { kind: 'onboarding-sign-in' }
  | { kind: 'migrate' }
  | { kind: 'workspaces'; hostId?: string }
  | { kind: 'workspaces-create'; hostId?: string }
  | { kind: 'workspace'; hostId?: string; workspaceId: string }
  | { kind: 'workspace-vscode'; hostId?: string; workspaceId: string }
  | { kind: 'project'; hostId?: string; projectId: string }
  | { kind: 'project-issue-create'; hostId?: string; projectId: string }
  | {
      kind: 'project-issue';
      hostId?: string;
      projectId: string;
      issueId: string;
    }
  | {
      kind: 'project-issue-workspace';
      hostId?: string;
      projectId: string;
      issueId: string;
      workspaceId: string;
    }
  | {
      kind: 'project-issue-workspace-create';
      hostId?: string;
      projectId: string;
      issueId: string;
      draftId: string;
    }
  | {
      kind: 'project-workspace-create';
      hostId?: string;
      projectId: string;
      draftId: string;
    };

export type NavigationTransition = {
  replace?: boolean;
};

export interface AppNavigation {
  navigate(destination: AppDestination, transition?: NavigationTransition): void;
  resolveFromPath(path: string): AppDestination | null;
}
```

Notes:
1. `AppDestination` has no router-specific fields (`to`, `params`, `search`
   objects tied to TanStack API shape).
2. Host scope is part of semantic destination for host-aware routes via
   optional `hostId`.
3. Remote adapter rule: use `destination.hostId ?? currentHostId` when mapping
   host-aware routes.
4. Local adapter ignores `hostId`.
5. Kanban create defaults move to local in-memory state, not query params.
6. Destination construction helpers may be added, but they must return
   `AppDestination` only.
7. `NavigationTransition` intentionally excludes `state`.

## Remote Host Resolution Rules
For host-aware destination kinds:
1. Compute `effectiveHostId = destination.hostId ?? currentHostId`.
2. If `effectiveHostId` exists, always navigate to host-scoped routes
   (`/hosts/$hostId/...`).
3. If `effectiveHostId` does not exist, do not navigate to unscoped project or
   workspace routes (no backward compatibility path).
4. When no host is available for a host-aware destination, redirect to root
   (`/`) and stop.

404 policy:
1. Direct browser requests to unscoped remote paths (`/projects/*`,
   `/workspaces/*`) must 404.
2. Internal remote navigation requests for host-aware destinations with no
   resolvable host must route to `/` (not 404).

Examples:
1. Current route host `h1`, destination `{ kind: 'project', projectId: 'p1' }`
   => `/hosts/h1/projects/p1`
2. Current route host `h1`, destination
   `{ kind: 'project', hostId: 'h2', projectId: 'p1' }`
   => `/hosts/h2/projects/p1`
3. No current host, destination `{ kind: 'workspace', workspaceId: 'w1' }`
   => `/`

## Pre-Implementation Research Checklist
### 2) Hostless Remote Behavior (Spike Complete)
Findings:
1. Remote route tree only defines host-scoped project/workspace routes
   (`/hosts/$hostId/...`), plus standalone account/login/upgrade/invitation
   pages and `/`.
2. Root (`/`) in remote renders `HomePage`, not `RootRedirectPage`; the
   onboarding/root redirect flow in `web-core` is currently local-web scoped.
3. `RemoteUserSystemProvider` already guards hostless config fetches with
   `enabled: ... && !!hostId`, so hostless pages do not execute the
   `remote-workspace-user-system` query.
4. `HomePage` and `RemoteAppShell` are mostly host-safe today: they use
   `preferredHostId` and open relay settings when no host is available.
5. The current remote fallback adapter still emits unscoped
   `/workspaces` and `/projects/...` targets, which do not exist in remote
   routes. This is the core hostless dead-end risk.
6. Host selection/gating logic is duplicated between `HomePage` and
   `RemoteAppShell`, which risks behavior drift as the migration proceeds.
7. Current `preferredHostId` fallback can select non-online hosts, but the
   plan does not yet define explicit UI behavior for host-required actions in
   offline/unpaired-only states.

Decisions locked for implementation:
1. Remote navigation must never emit unscoped project/workspace paths.
2. For host-aware destinations with no `effectiveHostId`, remote navigation
   must navigate to `/` and return (no hidden fallback path generation).
3. Remote `resolveFromPath` should only produce navigable host-aware
   destinations from `/hosts/$hostId/...` paths during normal operation.
4. Root host selection UX remains in `HomePage`/`RemoteAppShell`; navigation
   layer handles routing correctness only.
5. Keep strict external URL behavior: unscoped remote project/workspace URLs
   remain invalid and should hit 404.
6. Introduce one shared remote host-resolution helper (used by both
   `HomePage` and `RemoteAppShell`) to compute host candidates and avoid
   duplicated selection logic.
7. Define a single host-required UI action policy:
   - route host available: use it
   - otherwise online host available: use it
   - otherwise do not navigate to host-scoped project/workspace routes from UI
     affordances; open Relay Settings instead
8. Apply the same host-required policy to all relevant entry points (home
   project cards, app-shell project/workspace actions, host quick actions).

### 3) Hidden Direct Route Usage Outside `AppNavigation` (Spike Complete)
Findings:
1. `web-core` still has a small set of semantic route literals bypassing
   `AppNavigation`:
   - onboarding transitions in
     `features/onboarding/ui/LandingPage.tsx`
   - root redirects in
     `features/onboarding/ui/OnboardingSignInPage.tsx`
   - issue link rendering in
     `shared/components/ui-new/containers/RemoteIssueLink.tsx`
2. Route-local URL maintenance calls using `navigate({ to: '.' ... })` remain
   in place for query/state cleanup.
3. App-specific routes in `local-web` and `remote-web` (e.g. account/login/
   upgrade) intentionally stay app-owned and are out of this shared migration.

Decisions locked for implementation:
1. Eliminate TanStack `Link` usage in `web-core` for app navigation.
2. Eliminate absolute semantic route literals in `web-core` navigation code.
3. Migrate the known bypass callsites in this phase:
   - `packages/web-core/src/features/onboarding/ui/LandingPage.tsx`
   - `packages/web-core/src/features/onboarding/ui/OnboardingSignInPage.tsx`
   - `packages/web-core/src/shared/components/ui-new/containers/RemoteIssueLink.tsx`
4. Refactor `navigate({ to: '.' ... })` query/state normalization patterns in
   this migration (do not keep as raw router calls).

## Workspace Create Transport Rules (No Nav State)
Create-workspace payloads are transported via scratch drafts, not router
navigation state.

Rules:
1. Before navigating to a create-workspace route, persist payload into
   `ScratchType.DRAFT_WORKSPACE`.
2. Navigate using a route that identifies the draft:
   - linked create flows use existing draft-id routes
   - generic create flow uses a deterministic default draft id
3. `useCreateModeState` initializes from scratch only (plus explicit
   `initialState` prop when provided by non-router callers).
4. Remove all router `state` writes/reads for create payload transport.
5. If draft persistence fails, do not navigate; show an error and keep user on
   current screen.

## Kanban Create Defaults Rules (In-Memory Only)
Kanban issue-create defaults are transported via local state only.

Rules:
1. Store create defaults in one shared `web-core` in-memory state container
   (not per-component local state), keyed by `hostId + projectId`
   (`statusId`, `priority`, `assigneeIds`, `parentIssueId`).
2. Local-web and remote-web use the same key model:
   `effectiveHostId + projectId`, where local-web uses `null` host.
3. `startCreate(...)` writes defaults to local state and navigates to
   `/issues/new` with no query payload.
4. `updateCreateDefaults(...)` mutates local state only (no URL writes).
5. `KanbanIssuePanelContainer` initialization order:
   - draft issue scratch (if present for project)
   - in-memory create defaults
   - board-derived fallback defaults
6. Create-mode detection is path-based only (`/issues/new`), never query-based.
7. Remove query-based compatibility behavior for
   `statusId/priority/assignees/parentIssueId/mode/orgId` in one pass
   (no dual-read/write transition).
8. Reset defaults when:
   - issue create is submitted successfully
   - issue create is cancelled/closed
   - `effectiveHostId` or `projectId` changes
9. No persistence requirement for this state:
   - refresh/new tab/deep link may drop defaults
   - this is acceptable by design

## Migration Phases

### Phase 1: Shared Contract and Parsing
Status: Completed (March 1, 2026)

Completed:
1. Introduced `AppDestination` and `NavigationTransition` in
   `packages/web-core/src/shared/lib/routes/appNavigation.ts`.
2. Added semantic path parsing via `resolveAppDestinationFromPath(...)` and
   switched `resolveAppNavigationFromPath(...)` to route through that semantic
   parser.
3. Parser now ignores Kanban query params and preserves host-aware path
   parsing.
4. Consolidated project sidebar parsing by rewriting
   `packages/web-core/src/shared/lib/routes/projectSidebarRoutes.ts` to map from
   `AppDestination` (single shared path parser source of truth).

Plan adjustment:
1. The original task “replace route-object API in
   `appNavigation.ts`” is moved to Phase 2 to avoid a half-migrated provider
   contract/type break between `web-core`, `local-web`, and `remote-web`.

### Phase 2: Provider Interface
Status: Completed (March 1, 2026)

Completed:
1. Replace route-object API in
   `packages/web-core/src/shared/lib/routes/appNavigation.ts`.
2. Update `packages/web-core/src/shared/hooks/useAppNavigation.ts` provider
   types to the new imperative contract.
3. Remove legacy route-object navigation signatures and keep semantic methods
   (`navigate`, `resolveFromPath`) plus destination builders returning
   `AppDestination`.
4. Add explicit transition support on `navigate(...)` for `replace` and
   cross-screen state transport used by current workspace-create flows.

### Phase 3: Local Adapter
Status: Completed (March 1, 2026)

Completed:
1. Update `packages/local-web/src/app/navigation/AppNavigation.ts` to
   implement the new contract.
2. Keep local route mapping in local web (`AppDestination` -> local route
   target).
3. Keep `packages/local-web/src/app/entry/App.tsx` as wiring only.
4. Enforce exhaustive `switch(destination.kind)` in local adapter.
5. Keep the router-state type bridge localized to adapter boundary only.

### Phase 4: Remote Adapter
Status: Completed (March 1, 2026)

Completed:
1. Update `packages/remote-web/src/app/navigation/AppNavigation.ts` to
   implement the new contract.
2. Keep host-scoped behavior in remote package and remove unscoped workspace/
   project fallback routes from navigation resolution.
3. Keep `packages/remote-web/src/routes/__root.tsx` as wiring only.
4. Keep exhaustive `switch(destination.kind)` in remote adapter.
5. Add explicit host precedence behavior:
   - destination includes hostId: navigate to that host
   - destination omits hostId: navigate in current host context
   - no current host and host-aware destination: redirect to `/`
6. Map non-remote destinations (`onboarding`, `onboarding-sign-in`,
   `migrate`) to `/` in remote adapter.

### Phase 4.5: Remote Host UX Consolidation
1. Add a shared host-resolution helper in remote web and delete duplicated
   `preferredHostId` logic.
2. Apply the helper in:
   - `packages/remote-web/src/pages/HomePage.tsx`
   - `packages/remote-web/src/app/layout/RemoteAppShell.tsx`
3. Enforce one host-required UI action policy across home/app-shell:
   - route host if present
   - else online host if present
   - else open Relay Settings and do not navigate to host-scoped
     project/workspace routes
4. Keep adapter-level fallback behavior unchanged: when called without an
   effective host for a host-aware destination, navigate to `/`.

### Phase 5: Consumer Migration
Status: In Progress

Completed so far:
1. Migrated root, onboarding redirect, migration flow, workspace landing/layout,
   kanban/workspace sidebar entry points, and shared app shell/navbar entry
   points to `appNavigation.navigate(...)`.
2. Migrated action flows to the new navigation contract and removed
   `ActionExecutorContext.navigate` (router `NavigateFn`) from shared action
   context.
3. Migrated workspace-create state transport callsites to pass transition
   `state` through `appNavigation.navigate(...)` (no direct spread of route
   objects).

Migrate all `useAppNavigation` consumers from `navigate(appNavigation.toX())`
and spread patterns (`...appNavigation.toX()`) to imperative calls.

Direct routing cleanup policy:
1. Remove TanStack `Link` imports from `web-core` navigation surfaces.
2. Replace semantic `<Navigate to="...">` and `navigate({ to: '...' })` route
   literals in `web-core` with `AppNavigation` destinations.
3. Remove route-local normalization for legacy Kanban query cleanup
   (`navigate({ to: '.' ... })`) in favor of local-state updates.
4. Add guardrails to block new `navigate({ to: '.' ... })` usage in
   `web-core` after migration.

Kanban create-default source migration policy:
1. Remove `statusId`, `priority`, `assignees`, `parentIssueId`, `mode`, and
   `orgId` from project route search schema and parsing/serialization helpers.
2. Add a web-core in-memory create-default state source keyed by
   `effectiveHostId + projectId`.
3. Rewire `useKanbanNavigation` to read/write defaults via that local state.
4. Rewire create-mode status/priority/assignee mutation paths to local state
   only.
5. Delete legacy query migration behavior in `ProjectKanban` (`mode`, `orgId`).
6. Keep refresh/deep-link behavior non-persistent by design.
7. Make `isCreatingIssue` path-derived in all action visibility/shortcut logic.
8. Execute all query cleanup in one migration pass (no compatibility branch).

Kanban default-state rollout order (locked):
1. Remove query schema/parser/serializer support for Kanban default fields.
2. Add shared in-memory create-default state container and key helpers.
3. Rewire `useKanbanNavigation` and create-mode dialogs/actions to state-only.
4. Delete legacy cleanup/migration code paths in `ProjectKanban` and related
   consumers.

Router state removal policy:
1. Remove all `navigate(..., { state: ... })` and `state: (prev) => ...`
   patterns used for workspace-create initialization.
2. Remove `location.state` reads in workspace create-mode initialization.
3. Route workspace-create initialization through scratch draft helpers.

Primary files for this sub-migration:
- `packages/web-core/src/shared/actions/index.ts`
- `packages/web-core/src/pages/kanban/IssueWorkspacesSectionContainer.tsx`
- `packages/web-core/src/shared/dialogs/command-bar/WorkspaceSelectionDialog.tsx`
- `packages/web-core/src/integrations/useCreateModeState.ts`
- `packages/web-core/src/shared/hooks/useProjectWorkspaceCreateDraft.ts`
- `packages/web-core/src/shared/lib/workspaceCreateState.ts`

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
1. `replace` behavior currently encoded via spread-to-navigate patterns.
2. Create-default flow correctness after moving source-of-truth to in-memory
   local state.
3. Remembered-path restoration in `SharedAppLayout`.
4. Host-scoped routing behavior in remote when switching host context.
5. Onboarding/root redirect flows that currently rely on string destinations.
6. Project sidebar route derivation after parser consolidation.
7. Host precedence correctness for explicit-host vs current-host navigation.
8. Draft persistence failure handling (must not silently drop payload).
9. Host status transitions (online/offline/unpaired) while UI is open.
