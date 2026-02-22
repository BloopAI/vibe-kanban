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
- [ ] Step 7 pending
- [ ] Step 8 pending
- [ ] Step 9 pending

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
