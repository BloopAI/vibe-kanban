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
  - Remote frontend (`remote-frontend/`) architecture changes

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

- [ ] Phase A: foundations and guardrails (in progress, 2/4 complete)
- [ ] Phase B: app shell + page relocation
- [ ] Phase C: vertical feature migrations
- [ ] Phase D: dialog/modal consolidation
- [ ] Phase E: hooks/contexts/stores normalization
- [ ] Phase F: shared/integration cleanup
- [ ] Phase G: legacy removal + enforcement

## Phase A. Foundations And Guardrails

- [x] Add path aliases in `tsconfig.json` + `vite.config.ts` for:
  - `@/app/*`, `@/pages/*`, `@/widgets/*`, `@/features/*`, `@/entities/*`,
    `@/shared/*`, `@/integrations/*`
- [x] Add ESLint import-boundary rules for layer direction.
- [ ] Add temporary compatibility re-export files where needed to avoid
  breakage during phased moves.
- [ ] Freeze net-new additions to `src/components/ui-new` and
  `src/components/dialogs` (add a CI guard script that blocks new files in
  these paths while allowing edits to existing files).

## Phase B. App Shell + Page Relocation

1. Move bootstrap/router/provider code into `src/app/*`.
2. Move `pages/ui-new/*` into domain page folders under `src/pages/*`.
3. Keep `src/routes/*` in place (TanStack file-route convention), update imports
   to new page paths.
4. Move global style entrypoints into `src/app/styles`.

## Phase C. Vertical Feature Migrations

1. Migrate route by route:
   - onboarding + migration flows
   - workspaces + vscode workspace flow
   - project kanban flow
2. For each route surface:
   - move relevant containers/hooks/context/store into one feature folder
   - split large files into `model/`, `ui/`, `api/` subfolders
3. Decompose hotspots first:
   - `src/components/ui-new/actions/index.ts`
   - `src/lib/api.ts`
   - `src/components/ui-new/containers/KanbanContainer.tsx`
   - `src/components/ui-new/containers/SessionChatBoxContainer.tsx`
   - `src/components/ui-new/containers/NewDisplayConversationEntry.tsx`

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

1. PR 1: aliases + import boundaries + app shell moves (no behavior change)
2. PR 2: pages rehome + first feature slice (onboarding/migrate)
3. PR 3: workspace slice (chat, sidebar, terminal, preview)
4. PR 4: kanban slice + command bar/action system split
5. PR 5: dialogs/hooks/store consolidation + API/util split
6. PR 6: legacy folder deletion + lint hardening + final cleanup
