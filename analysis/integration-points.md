# Integration touchpoints and dependency map

## Snapshot
- Diff scope: 143 files, 11k insertions, 508 deletions (see `diff-stats.txt`).
- Extension themes: branch-template workflow, Omni notifications, release automation/CLI packaging, agent tooling (Claude + Genie), branding + UX updates.
- Classification: 4 critical chains, 3 important support layers, 2 optional/custom branding zones.

## Critical extension chains

### 1. Branch template workflow (critical)
**Goal:** allow per-task branch name templates and surface them end-to-end.

| Layer | Files | Notes |
|-------|-------|-------|
| Database | `crates/db/migrations/20250903172012_add_branch_template_to_tasks.sql`, SQLx query renames, `crates/db/src/models/{task.rs,task_attempt.rs}` | Adds `branch_template` column and query bindings. |
| Backend API | `crates/server/src/routes/{tasks.rs,task_attempts.rs}`, `crates/server/src/mcp/task_server.rs` | Propagates template through CRUD and MCP flows. |
| Shared types | `shared/types.ts` | Regenerated to expose template in TS clients. |
| Frontend | `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`, `TaskTemplateEditDialog.tsx`, `frontend/src/pages/project-tasks.tsx` | Captures template input, ensures payload compatibility. |
| Automation | `genie/wishes/upstream-merge-wish.md` | Wish scripts enforce template consistency during merges. |

**Dependencies:** configuration managers, SQLx metadata regeneration, front-end forms. **Conflicts:** recorded in merges `3185ac62`, `4647853d`, `576ae2ba` when upstream touched the same structs.

### 2. Omni notification system (critical)
**Goal:** deliver Omni-based notifications across backend and UI.

| Layer | Files | Notes |
|-------|-------|-------|
| Config | `crates/services/src/services/config/versions/v7.rs` | Introduces v7 config with embedded `OmniConfig` (commit `4570c047`). |
| Service | `crates/services/src/services/omni/{mod.rs,client.rs,types.rs}` | HTTP client + DTOs (`a3c8c7ff`, `84873608`). |
| API | `crates/server/src/routes/omni.rs`, `routes/mod.rs` | `/api/omni/*` endpoints for validation + instance listing (`66196ef7`). |
| Frontend | `frontend/src/components/omni/*`, `frontend/src/components/tasks/TaskFollowUpSection.tsx`, `frontend/src/pages/settings/GeneralSettings.tsx`, `frontend/src/lib/api.ts` | Settings UI and task notifications (`0468bcdc`, `990b4e10`, `53cd45c0`, `72018446`). |
| Docs/Wishes | `genie/wishes/omni-notification-wish.md` | Operational guidance for Omni rollout. |

**Dependencies:** requires config migration, API client updates, UI state handling. **Conflicts:** merges `3185ac62`, `8acfc749`, `c239b3aa` had to manually reapply Omni wiring when upstream edited settings screens.

### 3. Release automation and packaging (critical)
**Goal:** maintain Automagik Forge release pipeline across platforms + npm.

| Component | Files | Purpose |
|-----------|-------|---------|
| Workflows | `.github/workflows/{build-all-platforms.yml,pre-release.yml,pre-release-simple.yml}`, `.github/actions/setup-node/action.yml` | Custom build/publish orchestration (`1aac96bf`, `400ecfdf`, `4dd91f65`). |
| Scripts | `Makefile`, `gh-build.sh`, `scripts/release-analyzer.sh`, `local-build.sh`, `genie.sh` | CLI wrappers, release validation, dev bootstrap. |
| Packaging | `npx-cli/` (including `automagik-forge-0.3.4.tgz`, `bin/cli.js`, `package.json`) | Distributes Forge CLI through npm (`0ffc0485`). |
| Manifests | Root + crate `Cargo.toml`, `package.json`, `frontend/package.json`, `pnpm-lock.yaml`, `rust-toolchain.toml` | Pin dependencies for custom workflows (multiple CI fix commits). |

**Dependencies:** scripts assume workflow outputs; CLI package depends on generated artefacts; `.mcp.json` coordinates with CLI to expose MCP server endpoints. **Conflicts:** merges `b29eca4e`, `b876f9f5`, `3d2d40f6`, `4647853d` repeatedly touched these files.

### 4. Git operations safety (critical)
**Goal:** extend git/worktree handling for branch templates and reliability.

| Layer | Files | Notes |
|-------|-------|-------|
| Services | `crates/services/src/services/git.rs`, `worktree_manager.rs`, `auth.rs` | Custom branch template propagation, additional logging. |
| Tests | `crates/services/tests/git_workflow.rs` | Regression coverage for fork workflow. |
| Deployment | `crates/local-deployment/src/container.rs`, `crates/deployment/Cargo.toml` | Ensure worktree config in local containers. |

**Dependencies:** shares logic with branch template workflow; interacts with release automation (worktrees for build pipelines). **Conflicts:** merges `576ae2ba`, `b876f9f5`, `c239b3aa` show repeated manual resolutions.

## Important (should preserve) integrations

1. **Agent automation & Genie** (commits `244bd4c5`, `4e8aa43d`, `cdee569f`): `.claude/commands`, `.claude/hooks`, `genie/wishes/*.md`, `genie.sh`. Provides operational tooling and release playbooks; interacts with CI scripts and analysis output but not upstream.
2. **Frontend dialog/navigation layer**: reorganised under `frontend/src/components/dialogs/**`, `layout/navbar.tsx`, UI primitives. Required for Omni controls and branch-template UX but can be reapplied if upstream overwrites layout.
3. **Executor adjustments**: `crates/executors/src/executors/codex.rs`, `gemini.rs`, `default_mcp.json`, plus `frontend/src/components/dialogs/settings/*.tsx` for configuration. Needed for Omni + branch template tasks; merges `576ae2ba`, `6e8785b7`, `3185ac62` kept these bespoke behaviours.

## Optional/custom layers
- **Branding & assets:** `frontend/public/forge-*.{png,svg}`, favicons, `frontend/src/components/logo.tsx`, `frontend/src/styles/index.css`. Purely cosmetic; can be re-applied after upstream sync.
- **Documentation & planning:** `README.md`, `CLAUDE.md`, `DEVELOPER.md`, `roadmap-plan.md`, `analysis/*`. Inform stakeholders but do not affect runtime behaviour.

## Dependency interactions summary
```
Branch templates ─┬─ DB migrations ── SQLx metadata
                  ├─ REST routes ── shared/types.ts ── frontend dialogs
                  └─ git services ── release workflows (worktree naming)

Omni system ──────┬─ Config v7 ── service client
                  ├─ REST /api/omni ── frontend Omni settings
                  └─ Genie wishes (operational docs)

Release pipeline ─┬─ GitHub workflows
                  ├─ Makefile / gh-build.sh / scripts
                  ├─ npx-cli artefact
                  └─ .mcp.json + CLI consumers
```

## Critical vs optional checklist
- **Critical:** branch template chain, Omni system, release automation + packaging, git/worktree services.
- **Important:** executor/profile customisations, frontend dialog framework, agent automation/Genie.
- **Optional:** branding assets, documentation, generated wish content.

## Refactoring opportunities
1. **Feature flag Omni & branch templates**: wrap Omni routes/services and branch-template fields behind `cfg(feature = "forge-omni")` / `cfg(feature = "forge-branch-template")` to simplify future upstream merges.
2. **Modularise release scripts**: publish Makefile targets and `gh-build.sh` as reusable GitHub actions to reduce diff surface with upstream workflows.
3. **API client boundary**: expose Omni + branch template methods via dedicated TypeScript modules (`frontend/src/lib/api.ts`) to minimise churn when upstream restyles dialogs.
4. **Automated artefact regen**: wire SQLx + TS generation into CI so conflicts surface before manual merges (`scripts/release-analyzer.sh` already shells out commands; integrate upstream).
