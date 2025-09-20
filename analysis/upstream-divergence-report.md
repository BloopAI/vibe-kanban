# Upstream Divergence Analysis Report

## Data summary
- Source comparison: `upstream/main...work` (latest fetch 2025-09-18)
- Git diff statistics: **143 files changed**, **11,095 insertions**, **508 deletions** (`git diff --stat upstream/main...HEAD`).
- Risk inventory (from structured diff scan): **69 high-risk**, **32 medium-risk**, **16 low-risk**, **26 fork-only** files.
- Supporting artifacts generated: `raw-diff.txt`, `numstat.txt`, `diff-stats.txt`, `merge-history.txt`, `fork-commits.txt`.

> _Note_: The fork currently diverges in **143** paths (not 84). All files listed below were reviewed and categorised.

## Divergence highlights

### Branch template workflow (database + API + UI)
- Added `branch_template` column and SQL metadata for tasks (`crates/db/migrations/20250903172012_add_branch_template_to_tasks.sql`, SQLx JSON renames, `crates/db/src/models/task.rs`, `task_attempt.rs`).
- API surfaces persist the new field across task creation, updates and MCP interactions (`crates/server/src/routes/tasks.rs`, `task_attempts.rs`, `crates/server/src/mcp/task_server.rs`).
- Shared types regenerated to expose the field to the frontend (`shared/types.ts`).
- UI forms capture and submit the template (`frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`, `TaskTemplateEditDialog.tsx`, `frontend/src/pages/project-tasks.tsx`).
- Feature delivered across commits `44faf31c`, `347a4e33` and downstream merge resolutions `3185ac62`, `4647853d`, `576ae2ba`.
- **Risk**: High — schema drift triggers conflicts whenever upstream edits task models or API payloads.

### Omni notification system (full-stack addition)
- New service layer with `OmniService`, async client and DTOs (`crates/services/src/services/omni/{mod.rs,client.rs,types.rs}`) and config upgrade path to v7 (`crates/services/src/services/config/versions/v7.rs`).
- Backend routing exposes `/api/omni/*` endpoints (`crates/server/src/routes/omni.rs`, registered in `routes/mod.rs`).
- Frontend settings UI and task notification wiring (`frontend/src/components/omni/*`, `frontend/src/components/tasks/TaskFollowUpSection.tsx`, `frontend/src/lib/api.ts`, `frontend/src/pages/settings/GeneralSettings.tsx`).
- Supporting commits: `edfa30e4`, `66196ef7`, `a3c8c7ff`, `84873608`, `4570c047`, `ba8cca72`, `990b4e10`, `0468bcdc`, `53cd45c0`, `72018446`.
- **Risk**: High — cross-cutting change that touches backend config, REST surface and multiple UI modules.

### Release automation, packaging and CI/CD
- Custom workflows (`.github/workflows/build-all-platforms.yml`, `pre-release.yml`, `pre-release-simple.yml`, `publish.yml.disabled`) and bespoke Makefile/automation (`Makefile`, `gh-build.sh`, `scripts/release-analyzer.sh`).
- Node setup tweaks (`.github/actions/setup-node/action.yml`, `.gitignore`, `.mcp.json`).
- CLI packaging artefacts and scripts (`npx-cli/`, `npx-cli/automagik-forge-0.3.4.tgz`, `local-build.sh`, `genie.sh`).
- Dependency manifests adjusted (`Cargo.toml`, crate `Cargo.toml` files, `package.json`, `frontend/package.json`, `pnpm-lock.yaml`, `rust-toolchain.toml`).
- Key commits: `1aac96bf`, `400ecfdf`, `1fce29cd`, `4dd91f65`, `fac833b3`, `5ac67d4d`, `43e57a6a`, `270d4c46`, `0ffc0485`.
- **Risk**: High — upstream workflow refactors and dependency bumps routinely collide with these files.

### Agent & Genie automation layer
- Claude automation suite relocated and expanded (`.claude/agents/.github/workflows/publish.yml`, `.claude/commands/*.md`, `.claude/hooks/`, `.claude/minimal-hook.sh`).
- Genie wish system (`genie/wishes/*.md`, `.gitkeep`, `genie.sh`) adds scripted operational runbooks.
- Documentation assets refreshed (`CLAUDE.md`, `AGENTS.md`, new `DEVELOPER.md`, `roadmap-plan.md`, updated `README.md`).
- Commits: `4e8aa43d`, `244bd4c5`, `87c7c81a`, `cdee569f`, `73b248fc`, `8a999f3b`, `e243ac42`, `e6afaae0`.
- **Risk**: Fork-only — no upstream equivalents, but high maintenance overhead within the fork.

### Frontend UX and branding
- Reworked dialogs/navigation (`frontend/src/components/dialogs/**`, `layout/navbar.tsx`, `components/ui/{button,dialog}.tsx`).
- Large-scale styling and asset replacements (`frontend/src/styles/index.css`, `frontend/tailwind.config.js`, `frontend/public/forge-*.{png,svg}`, favicons, manifest updates).
- Omni and follow-up UX iterations merged repeatedly during upstream syncs (`6e8785b7`, `3185ac62`, `8acfc749`).
- **Risk**: Mixed — structural components (dialogs, TaskFollowUpSection) conflict-prone; pure branding assets low risk.

## Risk overview
- **High-risk clusters**: database schema & SQLx metadata, executor/service backends, REST routes, workflow automation, dependency manifests, Omni feature set.
- **Medium-risk clusters**: dialog components, auxiliary services, CLI packaging, documentation.
- **Low-risk changes**: asset swaps, manifest metadata, generated wish files.
- **Fork-only additions**: `.claude`, `genie`, new analysis docs — isolated but increase maintenance scope.

## Complete file inventory

Below is the categorised list of all 143 divergent files (status from `git diff --name-status`, line deltas from `git diff --numstat`).

### High risk (69 files)

| File | Status | Δ (add/del) | Category | Notes |
|------|--------|-------------|----------|-------|
| `crates/db/.sqlx/query-1bacc6c2253a92ee3b5c282b58bcae91a9eb264082d434b61c895fcf418e52e5.json` | R073 | +11/-5 | Backend - Database | Renamed from `crates/db/.sqlx/query-216efabcdaa2a6ea166e4468a6ac66d3298666a546e964a509538731ece90c9e.json` |
| `crates/db/.sqlx/query-2296414bd6baa4ff3b00c1844e2e76714f6b359d7b1fa524027116edbc506467.json` | R074 | +11/-5 | Backend - Database | Renamed from `crates/db/.sqlx/query-8cc087f95fb55426ee6481bdd0f74b2083ceaf6c5cf82456a7d83c18323c5cec.json` |
| `crates/db/.sqlx/query-29e8d701efbd44e99fee76e61833c89fe85c4ac09fbe06e3087d7915ca3d8e56.json` | R063 | +12/-6 | Backend - Database | Renamed from `crates/db/.sqlx/query-00aa2d8701f6b1ed2e84ad00b9b6aaf8d3cce788d2494ff283e2fad71df0a05d.json` |
| `crates/db/.sqlx/query-52c1b04069cb9887d33724bc3dafbd790b84f40021acc9598365ca2e2e16cbf5.json` | R074 | +11/-5 | Backend - Database | Renamed from `crates/db/.sqlx/query-2188432c66e9010684b6bb670d19abd77695b05d1dd84ef3102930bc0fe6404f.json` |
| `crates/db/.sqlx/query-6ff74bb31912078933ee96e9d893242838e12dd2f6eeb440801d5598a9935855.json` | R051 | +14/-8 | Backend - Database | Renamed from `crates/db/.sqlx/query-01a0f9724e5fce7d3312a742e72cded85605ee540150972e2a8364919f56d5c0.json` |
| `crates/db/.sqlx/query-8f575b3611d69314df63d59636683636bdfae03e03c5102f9499652b43d64020.json` | R064 | +12/-6 | Backend - Database | Renamed from `crates/db/.sqlx/query-5ae4dea70309b2aa40d41412f70b200038176dc8c56c49eeaaa65763a1b276eb.json` |
| `crates/db/.sqlx/query-be2c9141eb8405c6590397adbda54f2b6b918f298934c7a34645ca5c834268fd.json` | R058 | +11/-5 | Backend - Database | Renamed from `crates/db/.sqlx/query-024b53c73eda9f79c65997261d5cc3b35ce19c27b22dcc03dbb3fd11ad7bbfe2.json` |
| `crates/db/Cargo.toml` | M | +1/-1 | Backend - Database |  |
| `crates/db/migrations/20250903172012_add_branch_template_to_tasks.sql` | A | +2/-0 | Backend - Database |  |
| `crates/db/src/models/task.rs` | M | +26/-9 | Backend - Database |  |
| `crates/db/src/models/task_attempt.rs` | M | +66/-2 | Backend - Database |  |
| `crates/deployment/Cargo.toml` | M | +1/-2 | Backend - Deployment |  |
| `crates/local-deployment/Cargo.toml` | M | +1/-1 | Backend - Deployment |  |
| `crates/local-deployment/src/container.rs` | M | +70/-7 | Backend - Deployment |  |
| `crates/executors/Cargo.toml` | M | +1/-1 | Backend - Executors |  |
| `crates/executors/src/executors/codex.rs` | M | +11/-11 | Backend - Executors |  |
| `crates/executors/src/executors/gemini.rs` | M | +3/-3 | Backend - Executors |  |
| `crates/server/Cargo.toml` | M | +1/-2 | Backend - Server API |  |
| `crates/server/src/bin/generate_types.rs` | M | +3/-0 | Backend - Server API |  |
| `crates/server/src/mcp/task_server.rs` | M | +9/-1 | Backend - Server API |  |
| `crates/server/src/routes/mod.rs` | M | +2/-0 | Backend - Server API |  |
| `crates/server/src/routes/omni.rs` | A | +150/-0 | Backend - Server API |  |
| `crates/server/src/routes/task_attempts.rs` | M | +4/-1 | Backend - Server API |  |
| `crates/server/src/routes/tasks.rs` | M | +2/-0 | Backend - Server API |  |
| `crates/services/Cargo.toml` | M | +1/-1 | Backend - Services |  |
| `crates/services/src/services/auth.rs` | M | +3/-3 | Backend - Services |  |
| `crates/services/src/services/config/mod.rs` | M | +9/-7 | Backend - Services |  |
| `crates/services/src/services/config/versions/mod.rs` | M | +1/-0 | Backend - Services |  |
| `crates/services/src/services/config/versions/v1.rs` | M | +2/-0 | Backend - Services |  |
| `crates/services/src/services/config/versions/v2.rs` | M | +4/-0 | Backend - Services |  |
| `crates/services/src/services/config/versions/v7.rs` | A | +116/-0 | Backend - Services |  |
| `crates/services/src/services/git.rs` | M | +3/-3 | Backend - Services |  |
| `crates/services/src/services/worktree_manager.rs` | M | +1/-1 | Backend - Services |  |
| `crates/services/tests/git_workflow.rs` | M | +6/-6 | Backend - Services |  |
| `crates/utils/Cargo.toml` | M | +1/-1 | Backend - Utilities |  |
| `.github/actions/setup-node/action.yml` | M | +0/-2 | CI/CD & Ops |  |
| `.github/workflows/build-all-platforms.yml` | A | +244/-0 | CI/CD & Ops |  |
| `.github/workflows/pre-release-simple.yml` | A | +123/-0 | CI/CD & Ops |  |
| `.github/workflows/pre-release.yml` | M | +111/-66 | CI/CD & Ops |  |
| `.github/workflows/publish.yml.disabled` | A | +144/-0 | CI/CD & Ops |  |
| `.github/workflows/test.yml` | M | +0/-1 | CI/CD & Ops |  |
| `.mcp.json` | A | +27/-0 | CI/CD & Ops |  |
| `Dockerfile` | M | +3/-3 | CI/CD & Ops |  |
| `Makefile` | A | +142/-0 | CI/CD & Ops |  |
| `gh-build.sh` | A | +1028/-0 | CI/CD & Ops |  |
| `local-build.sh` | M | +50/-15 | CI/CD & Ops |  |
| `scripts/release-analyzer.sh` | A | +353/-0 | CI/CD & Ops |  |
| `npx-cli/bin/cli.js` | M | +37/-7 | CLI Packaging |  |
| `npx-cli/package.json` | M | +5/-5 | CLI Packaging |  |
| `package.json` | M | +40/-14 | Dependencies & Toolchain |  |
| `pnpm-lock.yaml` | M | +3/-4 | Dependencies & Toolchain |  |
| `rust-toolchain.toml` | M | +1/-1 | Dependencies & Toolchain |  |
| `frontend/src/components/dialogs/tasks/CreatePRDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` | M | +31/-0 | Frontend - App |  |
| `frontend/src/components/layout/navbar.tsx` | M | +2/-2 | Frontend - App |  |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/theme-provider.tsx` | M | +3/-1 | Frontend - App |  |
| `frontend/src/components/ui/button.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/ui/dialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/lib/api.ts` | M | +3/-0 | Frontend - App |  |
| `frontend/src/main.tsx` | M | +2/-0 | Frontend - App |  |
| `frontend/src/pages/project-tasks.tsx` | M | +1/-0 | Frontend - App |  |
| `frontend/src/pages/settings/GeneralSettings.tsx` | M | +4/-1 | Frontend - App |  |
| `frontend/src/styles/index.css` | M | +718/-1 | Frontend - App |  |
| `frontend/index.html` | M | +9/-9 | Frontend - Assets |  |
| `frontend/package.json` | M | +3/-2 | Frontend - Config |  |
| `frontend/tailwind.config.js` | M | +3/-2 | Frontend - Config |  |
| `frontend/vite.config.ts` | M | +38/-26 | Frontend - Config |  |
| `shared/types.ts` | M | +12/-6 | Shared Types |  |

### Medium risk (32 files)

| File | Status | Δ (add/del) | Category | Notes |
|------|--------|-------------|----------|-------|
| `crates/executors/default_mcp.json` | M | +5/-5 | Backend - Executors |  |
| `crates/services/src/services/mod.rs` | M | +1/-0 | Backend - Services |  |
| `crates/services/src/services/omni/client.rs` | A | +56/-0 | Backend - Services |  |
| `crates/services/src/services/omni/mod.rs` | A | +73/-0 | Backend - Services |  |
| `crates/services/src/services/omni/types.rs` | A | +189/-0 | Backend - Services |  |
| `crates/utils/src/assets.rs` | M | +18/-5 | Backend - Utilities |  |
| `crates/utils/src/path.rs` | M | +5/-5 | Backend - Utilities |  |
| `crates/utils/src/port_file.rs` | M | +2/-2 | Backend - Utilities |  |
| `.gitignore` | M | +8/-0 | CI/CD & Ops |  |
| `npx-cli/README.md` | M | +5/-5 | CLI Packaging |  |
| `npx-cli/automagik-forge-0.3.4.tgz` | A | +0/-0 | CLI Packaging |  |
| `frontend/src/components/dialogs/auth/GitHubLoginDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/auth/ProvidePatDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/global/OnboardingDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/global/PrivacyOptInDialog.tsx` | M | +2/-2 | Frontend - App |  |
| `frontend/src/components/dialogs/global/ReleaseNotesDialog.tsx` | M | +2/-2 | Frontend - App |  |
| `frontend/src/components/dialogs/projects/ProjectEditorSelectionDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/projects/ProjectFormDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/settings/DeleteConfigurationDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/shared/FolderPickerDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/DeleteTaskConfirmationDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/EditorSelectionDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/RebaseDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/RestoreLogsDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/dialogs/tasks/TaskTemplateEditDialog.tsx` | M | +1/-1 | Frontend - App |  |
| `frontend/src/components/logo.tsx` | M | +8/-11 | Frontend - App |  |
| `frontend/src/components/omni/OmniCard.tsx` | A | +128/-0 | Frontend - App |  |
| `frontend/src/components/omni/OmniModal.tsx` | A | +230/-0 | Frontend - App |  |
| `frontend/src/components/omni/api.ts` | A | +29/-0 | Frontend - App |  |
| `frontend/src/components/omni/types.ts` | A | +27/-0 | Frontend - App |  |
| `frontend/src/components/projects/ProjectCard.tsx` | M | +1/-1 | Frontend - App |  |

### Low risk (16 files)

| File | Status | Δ (add/del) | Category | Notes |
|------|--------|-------------|----------|-------|
| `dev_assets_seed/config.json` | D | +0/-19 | Assets & Seeds |  |
| `assets/scripts/toast-notification.ps1` | M | +1/-1 | CI/CD & Ops |  |
| `genie.sh` | A | +16/-0 | CI/CD & Ops |  |
| `AGENTS.md` | M | +8/-8 | Docs & Planning |  |
| `CLAUDE.md` | M | +92/-13 | Docs & Planning |  |
| `README.md` | M | +465/-67 | Docs & Planning |  |
| `frontend/public/favicon-16x16.png` | M | +0/-0 | Frontend - Assets |  |
| `frontend/public/favicon-32x32.png` | M | +0/-0 | Frontend - Assets |  |
| `frontend/public/favicon.ico` | M | +0/-0 | Frontend - Assets |  |
| `frontend/public/screenshot.png` | A | +0/-0 | Frontend - Assets |  |
| `frontend/public/site.webmanifest` | M | +1/-1 | Frontend - Assets |  |
| `frontend/public/vibe-kanban-logo-dark.svg` | D | +0/-3 | Frontend - Assets |  |
| `frontend/public/vibe-kanban-logo.svg` | D | +0/-3 | Frontend - Assets |  |
| `frontend/public/vibe-kanban-screenshot-overview.png` | D | +0/-0 | Frontend - Assets |  |
| `check-both.sh` | D | +0/-23 | Misc |  |
| `test-npm-package.sh` | D | +0/-42 | Misc |  |

### Fork-only risk (26 files)

| File | Status | Δ (add/del) | Category | Notes |
|------|--------|-------------|----------|-------|
| `.claude/agents/.github/workflows/publish.yml` | R099 | +1/-2 | Agents & Automation | Renamed from `.github/workflows/publish.yml` |
| `.claude/agents/forge-master.md` | A | +216/-0 | Agents & Automation |  |
| `.claude/commands/forge.md` | A | +163/-0 | Agents & Automation |  |
| `.claude/commands/prompt.md` | A | +642/-0 | Agents & Automation |  |
| `.claude/commands/review-merge-pr.md` | A | +133/-0 | Agents & Automation |  |
| `.claude/commands/upmerge.md` | A | +190/-0 | Agents & Automation |  |
| `.claude/commands/wish-agent.md` | A | +868/-0 | Agents & Automation |  |
| `.claude/commands/wish.md` | A | +625/-0 | Agents & Automation |  |
| `.claude/hooks/examples/README.md` | A | +13/-0 | Agents & Automation |  |
| `.claude/hooks/examples/settings.json` | A | +11/-0 | Agents & Automation |  |
| `.claude/hooks/examples/tdd-hook.sh` | A | +20/-0 | Agents & Automation |  |
| `.claude/minimal-hook.sh` | A | +12/-0 | Agents & Automation |  |
| `genie/wishes/.gitkeep` | R100 | +0/-0 | Agents & Automation | Renamed from `dev_assets_seed/db.sqlite` |
| `genie/wishes/fork-merge-pain-relief-wish.md` | A | +238/-0 | Agents & Automation |  |
| `genie/wishes/omni-notification-wish.md` | A | +1087/-0 | Agents & Automation |  |
| `genie/wishes/per-agent-mcp-tool-selection-wish.md` | A | +445/-0 | Agents & Automation |  |
| `genie/wishes/upstream-merge-wish.md` | A | +317/-0 | Agents & Automation |  |
| `analysis/conflict-patterns.md` | A | +190/-0 | Analysis Docs |  |
| `analysis/integration-points.md` | A | +335/-0 | Analysis Docs |  |
| `analysis/upstream-divergence-report.md` | A | +133/-0 | Analysis Docs |  |
| `DEVELOPER.md` | A | +207/-0 | Docs & Planning |  |
| `roadmap-plan.md` | A | +136/-0 | Docs & Planning |  |
| `frontend/public/forge-clear.png` | A | +0/-0 | Frontend - Assets |  |
| `frontend/public/forge-clear.svg` | A | +1/-0 | Frontend - Assets |  |
| `frontend/public/forge-dark.png` | A | +0/-0 | Frontend - Assets |  |
| `frontend/public/forge-dark.svg` | A | +1/-0 | Frontend - Assets |  |

