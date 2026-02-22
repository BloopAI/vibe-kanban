# `@vibe/web` Full Cutover Plan

## Goal

Migrate the current web app from `frontend/` to `packages/web/` as a full
cutover, with package name `@vibe/web`, and remove `frontend/` as an active app
package.

## Decision

- Package name: `@vibe/web`
- Strategy: full cutover (no compatibility shim)

## Scope

- In scope:
  - Web app source/config relocation to `packages/web/`
  - Build/dev/test/CI/release path updates
  - Rust static asset embed path updates
  - Docker and local build script updates
- Out of scope:
  - Remote app migration (`remote-frontend/`) beyond dependency/install path
    adjustments needed for workspace install

## Execution Order

## Status

- [x] Step 1 completed
- [x] Step 2 completed
- [x] Step 3 completed (executed before Step 2 to restore local type-check)
- [x] Step 4 completed
- [x] Step 5 completed
- [x] Step 6 completed
- [x] Step 7 completed
- [x] Step 8 completed
- [x] Step 9 completed

## 1. Move the web app package

1. Create `packages/web/`.
2. Move all app files from `frontend/` into `packages/web/`:
   - `src/`, `public/`, `index.html`
   - `vite.config.ts`, `tsconfig*.json`
   - `.eslintrc.cjs`, `.prettierrc.json`, `.prettierignore`
   - `postcss.config.cjs`, `tailwind.new.config.js`
   - `components.json`, `components.legacy.json`
   - `AGENTS.md`
3. Update `packages/web/package.json`:
   - `name` -> `@vibe/web`
   - keep existing app scripts (`dev`, `build`, `check`, `lint`, `format`)

## 2. Update workspace and root scripts

1. `pnpm-workspace.yaml`
   - remove `frontend` workspace entry
   - ensure `packages/*` includes `packages/web`
2. Root `package.json`
   - replace `frontend:*` script family with `web:*` equivalents:
     - `web:dev`, `web:check`, `web:lint`
   - update composite scripts:
     - `dev`, `dev:qa`, `check`, `lint`, `format`
   - switch command paths from `cd frontend` to `cd packages/web` (or
     `pnpm --filter @vibe/web ...`)
3. Keep env var `FRONTEND_PORT` unchanged for now to avoid backend/runtime env
   churn during this path migration.

## 3. Update web app local tooling references

1. `packages/web/vite.config.ts`
   - update `shared` alias from `../shared` to `../../shared`
   - update `fs.allow` root allowance accordingly
2. `packages/web/tsconfig.json`
   - update `shared/*` path mapping from `../shared/*` to `../../shared/*`
3. `packages/web/tailwind.new.config.js`
   - update scan path from `../packages/ui/src/**/*` to `../ui/src/**/*`
4. `packages/ui/package.json`
   - update Prettier config reference from
     `../../frontend/.prettierrc.json` to `../../packages/web/.prettierrc.json`
5. `scripts/check-i18n.sh`
   - change locale path and lint working directory from `frontend/` to
     `packages/web/`
6. Audit direct relative imports to `shared/*` inside moved app files and
   convert them to `shared/*` alias imports where needed.

## 4. Update backend static embed paths

1. `crates/server/src/routes/frontend.rs`
   - change RustEmbed folder from `../../frontend/dist` to
     `../../packages/web/dist`
2. `crates/server/build.rs`
   - change dummy dist path from `../../frontend/dist` to
     `../../packages/web/dist`

## 5. Update build and container scripts

1. Root `Dockerfile`
   - copy `packages/web/package*.json` for dependency install cache
   - build web app via `cd packages/web && pnpm run build`
2. `local-build.sh`
   - build web app via `cd packages/web && npm run build`
3. `crates/remote/Dockerfile`
   - replace `COPY frontend/package.json ...` with `COPY packages/web/package.json ...`
   - keep `remote-frontend` build target unchanged

## 6. Update CI workflows

1. `.github/workflows/test.yml`
   - path filter: replace `frontend/**` with `packages/web/**`
   - frontend check commands: run from `packages/web`
2. `.github/workflows/pre-release.yml`
   - version bump step: update `cd frontend` to `cd packages/web`
   - `git add frontend/package.json` -> `git add packages/web/package.json`
   - build job: `cd packages/web && npm run lint/tsc/build`
   - artifact paths:
     - `frontend/dist` -> `packages/web/dist`
   - sourcemap path:
     - `./frontend/dist` -> `./packages/web/dist`
   - zip/release packaging references updated to `packages/web/dist`
3. Keep artifact naming (`frontend-dist`) only if desired for continuity, or
   rename to `web-dist` in one pass.

## 7. Update docs and path mentions

1. Update high-signal docs referencing app location:
   - root `AGENTS.md`
   - `README.md` asset paths from `frontend/public/*` to
     `packages/web/public/*`
2. Update comments/examples that explicitly mention `frontend/src/...` where
   these are used as active guidance (skip historical/mock fixture content unless
   needed).

## 8. Remove old `frontend/` package

1. Delete `frontend/` after all references are migrated.
2. Run a repo-wide check to ensure no active build/runtime references remain:
   - `rg -n "frontend/" .`
3. Allow remaining intentional references:
   - `remote-frontend/`
   - historical text in docs/changelogs if intentionally preserved
   - migration history logs (`packages-web-cutover-plan.md`, `progress.txt`)
   - fixture/mock sample content (e.g., `packages/web/src/mock/normalized_entries.json`)

## 9. Verification Checklist

1. Install and dependency graph:
   - `pnpm install`
2. Web app:
   - `pnpm run web:check`
   - `pnpm run web:lint`
   - `pnpm run web:dev`
   - `pnpm --filter @vibe/web run build`
3. Workspace:
   - `pnpm run check`
   - `pnpm run lint`
4. Backend with embedded assets:
   - `cargo check -p server`
5. End-to-end local dev:
   - `pnpm run dev`
6. Formatting (repo requirement):
   - `pnpm run format`

## 10. Rollout Notes

- This is a single-phase full cutover; merge only when CI is green across:
  - web checks
  - backend checks
  - pre-release workflow dry-run confidence
- If needed, split into two PRs while preserving full-cutover semantics:
  1. relocation + local scripts + backend paths
  2. CI/release workflow updates + docs cleanup

## 11. Post-Cutover Structure Standardization Plan

## Goal

Now that `frontend/` -> `packages/web/` cutover is complete, standardize
`packages/web/src` into a single, predictable structure with clear ownership
boundaries and no parallel "legacy vs new" trees.

## Current Structure Snapshot (2026-02-22)

- `410` files under `packages/web/src`
- `151` files under `src/components/`
- `93` files under `src/components/ui-new/`
- `58` files under non-`ui-new` components (still actively imported)
- `86` root hooks under `src/hooks/` plus `6` more under
  `src/components/ui-new/hooks/`
- `28` legacy dialogs under `src/components/dialogs/` plus `34` dialogs under
  `src/components/ui-new/dialogs/`
- Duplicate concept example: `RebaseDialog.tsx` exists in both dialog trees

This confirms the app is functionally cut over, but internally split across
multiple architectural styles.

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

## Execution Plan (Phased, No Big-Bang)

## Status

- [ ] Phase A: foundations and guardrails
- [ ] Phase B: app shell + page relocation
- [ ] Phase C: vertical feature migrations
- [ ] Phase D: dialog/modal consolidation
- [ ] Phase E: hooks/contexts/stores normalization
- [ ] Phase F: shared/integration cleanup
- [ ] Phase G: legacy removal + enforcement

## Phase A. Foundations And Guardrails

1. Add path aliases in `tsconfig.json` + `vite.config.ts` for:
   - `@/app/*`, `@/pages/*`, `@/widgets/*`, `@/features/*`, `@/entities/*`,
     `@/shared/*`, `@/integrations/*`
2. Add ESLint import-boundary rules for layer direction.
3. Add temporary compatibility re-export files where needed to avoid
   breakage during phased moves.
4. Freeze net-new additions to `src/components/ui-new` and `src/components/dialogs`.

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
