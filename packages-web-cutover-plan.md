# `@vibe/web` Structure Standardization Plan (Active)

## Context

The `frontend/` to `packages/web/` cutover is complete.
This plan tracks only the remaining frontend structure standardization work.

## Goal

Standardize `packages/web/src` into a single, predictable structure with clear
ownership boundaries and no parallel "legacy vs new" trees.

## Scope

- In scope:
  - Frontend source structure normalization in `packages/web/src`
  - Consolidation of duplicated component/dialog/hook patterns
  - Import boundary enforcement and phased migration path
- Out of scope:
  - Re-doing the completed package/location cutover work
  - Remote frontend (`packages/remote-web/`) architecture changes

## Parallel Phase Split (2026-02-22)

The remaining work is split into three branch-parallel tracks with explicit
ownership to reduce merge conflicts.

- Track 1 plan: `packages-web-cutover-plan.parallel-1-ui-dialogs.md`
  - focus: UI actions hotspot + dialog consolidation
- Track 2 plan: `packages-web-cutover-plan.parallel-2-model.md`
  - focus: hooks/contexts/stores normalization
- Track 3 plan: `packages-web-cutover-plan.parallel-3-shared-integrations.md`
  - focus: shared + integrations + API split

### Parallel Rules

- Each branch should only modify files listed in its track ownership section.
- Keep backward-compatible facades/shims during the parallel phase; defer
  facade removal to final consolidation.
- Avoid editing shared coordination files in parallel branches:
  - `packages-web-cutover-plan.md`
  - `progress.txt`
  - `.github/workflows/test.yml`
  - `packages/web/.eslintrc.cjs`
  - `packages/web/tsconfig.json`
  - `packages/web/vite.config.ts`
- Use per-track progress logs instead:
  - `progress.parallel-track-1-ui-dialogs.txt`
  - `progress.parallel-track-2-model.txt`
  - `progress.parallel-track-3-shared-integrations.txt`

### Post-Parallel Merge

After all three track branches merge, start final consolidation to:

- remove temporary compatibility facades/shims,
- complete legacy folder deletion and lint hardening,
- run repo-wide stale-import cleanup and final verification.

## Current Structure Snapshot (2026-02-22)

- `410` files under `packages/web/src`
- `151` files under `src/components/`
- `93` files under `src/components/ui-new/`
- `58` files under non-`ui-new` components (still actively imported)
- `86` root hooks under `src/hooks/` plus `6` under
  `src/components/ui-new/hooks/`
- `28` dialogs under `src/components/dialogs/` plus `34` dialogs under
  `src/components/ui-new/dialogs/`
- Duplicate concept example: `RebaseDialog.tsx` exists in both dialog trees

## Target Standard Structure

```text
packages/web/src/
  app/
    entry/                 # app bootstrap (main.tsx + providers wiring)
    router/                # router creation + router utilities
    providers/             # global providers/scopes/theme/config/modal
    styles/                # global style imports and tokens
  routes/                  # TanStack file routes (kept for plugin compatibility)
  pages/                   # route-level page composition only
    onboarding/
    migrate/
    workspaces/
    projects/
    root/
  widgets/                 # page sections composed from features/entities
  features/                # user-facing capabilities with local ui/model/api
    command-bar/
    settings/
    migration/
    onboarding/
    workspace-chat/
    kanban/
    preview/
    git/
  entities/                # business entities and shared domain logic
    workspace/
    session/
    project/
    issue/
    organization/
    user/
    repo/
  shared/                  # cross-domain reusable code
    api/
    ui/
    hooks/
    lib/
    stores/
    types/
    constants/
    i18n/
    keyboard/
  integrations/            # external-system adapters
    electric/
    vscode/
  test/
    fixtures/
```

## Layer Rules (Enforced)

- `pages` may import `widgets`, `features`, `entities`, `shared`, `app`.
- `widgets` may import `features`, `entities`, `shared`.
- `features` may import `entities`, `shared`.
- `entities` may import `shared`.
- `shared` imports only `shared`.
- `integrations` can be imported by `app/features/entities/shared` but should
  not depend on app pages/widgets.
- No cross-feature imports through deep relative paths; import via layer aliases.

## Source Folder Mapping

1. `src/main.tsx`, `src/App.tsx`, `src/Router.tsx`, `src/components/*Provider.tsx`,
   `src/components/ui-new/scope/*` -> `src/app/{entry,router,providers}`
2. `src/pages/ui-new/*` -> `src/pages/<domain>/*`
3. `src/components/ui-new/containers/*` -> `src/widgets/*` or
   `src/features/*/ui/*` (based on scope)
4. `src/components/ui-new/dialogs/*` and `src/components/dialogs/*` ->
   `src/features/*/ui/dialogs/*` plus `src/shared/ui/dialogs/*` for reusable
   dialogs
5. `src/components/NormalizedConversation/*` and
   `src/components/ui-new/containers/NewDisplayConversationEntry.tsx` ->
   `src/features/workspace-chat/*`
6. `src/components/tasks/*`, `src/components/org/*`,
   `src/components/settings/*`, `src/components/agents/*`, `src/components/ide/*`
   -> nearest `features/*` or `entities/*` ownership
7. `src/hooks/*` -> split into `features/*/model/hooks`, `entities/*/model/hooks`,
   and `shared/hooks`
8. `src/contexts/*` -> colocate into owning feature/entity model folders;
   `remote/*` contexts move under corresponding entity
9. `src/stores/*` -> `features/*/model/store` or `shared/stores`
10. `src/lib/api.ts`, `src/lib/remoteApi.ts` -> `src/shared/api/*` and
    entity/feature-specific API modules
11. `src/lib/*` + `src/utils/*` + `src/constants/*` + `src/types/*` ->
    normalized `src/shared/{lib,constants,types}`
12. `src/lib/electric/*` -> `src/integrations/electric/*`
13. `src/vscode/*` -> `src/integrations/vscode/*`
14. `src/i18n/*` -> `src/shared/i18n/*`
15. `src/keyboard/*` -> `src/shared/keyboard/*` (or `src/app/keyboard/*` for
    app-scope handlers)
16. `src/styles/*` -> `src/app/styles/*`
17. `src/mock/*` -> `src/test/fixtures/*` (or `src/shared/test-fixtures/*` if
    runtime-shared)

## Active Phases

## Status

- [x] Phase A: foundations and guardrails
- [x] Phase B: app shell + page relocation
- [ ] Phase C: vertical feature migrations (in progress)
- [ ] Phase D: dialog/modal consolidation
- [ ] Phase E: hooks/contexts/stores normalization
- [ ] Phase F: shared/integration cleanup
- [ ] Phase G: legacy removal + enforcement
- [ ] Parallel Phase: execute tracks 1-3 on separate branches
- [ ] Final Consolidation: post-merge cleanup and hardening

## Phase A. Foundations And Guardrails

- [x] Add path aliases in `tsconfig.json` + `vite.config.ts` for:
  - `@/app/*`, `@/pages/*`, `@/widgets/*`, `@/features/*`, `@/entities/*`,
    `@/shared/*`, `@/integrations/*`
- [x] Add ESLint import-boundary rules for layer direction.
- [x] Add temporary compatibility re-export files where needed to avoid
  breakage during phased moves:
  - moved initial app-shell modules into `src/app/*`
  - added compatibility shims at legacy paths:
    - `src/main.tsx` -> `src/app/entry/Bootstrap.tsx`
    - `src/App.tsx` -> `src/app/entry/App.tsx`
    - `src/Router.tsx` -> `src/app/router/index.ts`
    - `src/components/ConfigProvider.tsx` ->
      `src/app/providers/ConfigProvider.tsx`
    - `src/components/ThemeProvider.tsx` ->
      `src/app/providers/ThemeProvider.tsx`
    - `src/components/ui-new/scope/NewDesignScope.tsx` ->
      `src/app/providers/NewDesignScope.tsx`
    - `src/components/ui-new/scope/VSCodeScope.tsx` ->
      `src/app/providers/VSCodeScope.tsx`
- [x] Freeze net-new additions to `src/components/ui-new` and
  `src/components/dialogs` via CI guard script:
  - uses committed allowlist baseline (not base-branch diff) so checks are
    stable while `main` and migration branches differ
  - `scripts/check-legacy-frontend-paths.sh`
  - `scripts/legacy-frontend-paths-allowlist.txt`
  - wired into `.github/workflows/test.yml` frontend checks

## Phase B. App Shell + Page Relocation

- [x] Move bootstrap/router/provider code into `src/app/*`.
  - completed initial wave and migrated remaining `ConfigProvider` and
    `ThemeProvider` imports to canonical `@/app/providers/*` paths
- [x] Move `pages/ui-new/*` into domain page folders under `src/pages/*`.
  - moved route-level pages into
    `src/pages/{onboarding,migrate,workspaces,projects,root}`
  - kept temporary compatibility shims at `src/pages/ui-new/*`
- [x] Keep `src/routes/*` in place (TanStack file-route convention), update
  imports to new page paths.
- [x] Move global style entrypoints into `src/app/styles`.
  - moved style files to canonical app paths:
    - `src/app/styles/new/index.css`
    - `src/app/styles/diff-style-overrides.css`
    - `src/app/styles/edit-diff-overrides.css`
  - updated imports to `@/app/styles/*`
  - kept temporary compatibility shim files under `src/styles/*`

## Phase C. Vertical Feature Migrations

1. Migrate route by route:
   - onboarding + migration flows
   - workspaces + vscode workspace flow
   - project kanban flow
   - progress:
     - moved migration flow containers from
       `src/components/ui-new/containers/Migrate*` to
       `src/features/migration/ui/*`
     - updated `src/pages/migrate/MigratePage.tsx` to import
       `@/features/migration/ui/MigrateLayout`
     - kept temporary compatibility shims at legacy
       `src/components/ui-new/containers/Migrate*` paths
     - moved onboarding page implementations from
       `src/pages/onboarding/*` to `src/features/onboarding/ui/*`
     - converted `src/pages/onboarding/*` into thin route-level re-export
       wrappers
     - added temporary hook adapters:
       - `src/hooks/useTheme.ts`
       - `src/hooks/useUserSystem.ts`
       to keep feature files from importing `@/app/*` directly under current
       lint boundary rules
     - moved workspace page-level composition from
       `src/components/ui-new/containers/WorkspacesLayout.tsx` to
       `src/features/workspace/ui/WorkspacesLayout.tsx`
     - updated `src/pages/workspaces/Workspaces.tsx` to import from
       `@/features/workspace/ui/WorkspacesLayout`
     - kept temporary compatibility shim at legacy
       `src/components/ui-new/containers/WorkspacesLayout.tsx`
     - moved VSCode workspace page composition from
       `src/pages/workspaces/VSCodeWorkspacePage.tsx` to
       `src/features/workspace/ui/VSCodeWorkspacePage.tsx`
     - converted `src/pages/workspaces/VSCodeWorkspacePage.tsx` into a thin
       route-level re-export wrapper
     - moved project-kanban page composition from
       `src/pages/projects/ProjectKanban.tsx` to
       `src/features/kanban/ui/ProjectKanban.tsx`
     - converted `src/pages/projects/ProjectKanban.tsx` into a thin
       route-level re-export wrapper
     - moved kanban board container composition from
       `src/components/ui-new/containers/KanbanContainer.tsx` to
       `src/features/kanban/ui/KanbanContainer.tsx`
     - updated `src/features/kanban/ui/ProjectKanban.tsx` to import local
       `./KanbanContainer` canonical path
     - kept temporary compatibility shim at legacy
       `src/components/ui-new/containers/KanbanContainer.tsx`
     - updated moved kanban feature file to use `src/hooks/useUserSystem.ts`
       adapter instead of importing `@/app/*` directly
     - moved session chat composer container from
       `src/components/ui-new/containers/SessionChatBoxContainer.tsx` to
       `src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`
     - moved conversation entry renderer from
       `src/components/ui-new/containers/NewDisplayConversationEntry.tsx` to
       `src/features/workspace-chat/ui/NewDisplayConversationEntry.tsx`
     - updated canonical imports to workspace-chat feature path in:
       - `src/components/ui-new/containers/WorkspacesMainContainer.tsx`
       - `src/components/ui-new/containers/ProjectRightSidebarContainer.tsx`
       - `src/components/ui-new/containers/ConversationListContainer.tsx`
     - kept temporary compatibility shims at legacy paths:
       - `src/components/ui-new/containers/SessionChatBoxContainer.tsx`
       - `src/components/ui-new/containers/NewDisplayConversationEntry.tsx`
     - updated moved workspace-chat feature files to use hook adapters
       (`src/hooks/useUserSystem.ts`, `src/hooks/useTheme.ts`) instead of
       importing `@/app/*` directly
2. For each route surface:
   - move relevant containers/hooks/context/store into one feature folder
   - split large files into `model/`, `ui/`, `api/` subfolders
3. Decompose hotspots first:
   - [ ] `src/components/ui-new/actions/index.ts`
   - [ ] `src/lib/api.ts`
   - [x] `src/components/ui-new/containers/KanbanContainer.tsx` ->
     `src/features/kanban/ui/KanbanContainer.tsx` (legacy shim retained)
   - [x] `src/components/ui-new/containers/SessionChatBoxContainer.tsx` ->
     `src/features/workspace-chat/ui/SessionChatBoxContainer.tsx`
     (legacy shim retained)
   - [x] `src/components/ui-new/containers/NewDisplayConversationEntry.tsx` ->
     `src/features/workspace-chat/ui/NewDisplayConversationEntry.tsx`
     (legacy shim retained)

## Phase D. Dialog/Modal Consolidation

1. Establish single dialog placement rule:
   - feature-specific dialogs live with feature
   - shared dialogs live in `src/shared/ui/dialogs`
2. Merge duplicate dialog concepts (start with `RebaseDialog.tsx`).
3. Remove cross-feature barrel exports in `src/components/dialogs/index.ts`
   after migrations.

## Phase E. Hooks/Contexts/Stores Normalization

1. Move domain hooks (`organization`, `project`, `workspace`, `issue`, etc.)
   under corresponding entity/feature model folders.
2. Consolidate duplicated hook families (e.g. conversation history variants).
3. Reduce app-wide contexts where narrower feature stores are sufficient.
4. Keep provider trees local to feature/page when possible.

## Phase F. Shared/Integration Cleanup

1. Split API monolith into typed modules by domain.
2. Merge `lib` and `utils` into `shared/lib` with clear naming.
3. Move external adapters to `integrations/electric` and `integrations/vscode`.
4. Normalize `types`, `constants`, `keyboard`, and `i18n` under `shared`.

## Phase G. Legacy Removal + Enforcement

1. Remove emptied legacy folders:
   - `src/components/ui-new`
   - `src/components/dialogs`
   - remaining one-off legacy component folders no longer referenced
2. Update lint config to reference new paths (`views/primitives` under
   `features`/`shared`, not `ui-new` hardcoded paths).
3. Run repo-wide checks for stale imports:
   - `rg -n "components/ui-new|components/dialogs|pages/ui-new" packages/web/src`

## Verification Checklist (Each Phase + Final)

1. `pnpm run format`
2. `pnpm run web:check`
3. `pnpm run web:lint`
4. `pnpm --filter @vibe/web run build`
5. Smoke-test key routes:
   - `/`
   - `/onboarding`
   - `/migrate`
   - `/workspaces/create`
   - `/projects/:projectId`
   - `/workspaces/:workspaceId/vscode`

## PR Strategy

1. Parallel PR A: Track 1 (`packages-web-cutover-plan.parallel-1-ui-dialogs.md`)
2. Parallel PR B: Track 2 (`packages-web-cutover-plan.parallel-2-model.md`)
3. Parallel PR C: Track 3 (`packages-web-cutover-plan.parallel-3-shared-integrations.md`)
4. Final consolidation PR: shim removal + lint hardening + legacy deletion
