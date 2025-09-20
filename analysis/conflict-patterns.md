# Historical conflict pattern analysis

## Merge history reviewed
A review of `git log --merges --grep upstream` surfaces nine upstream integration commits between 2025-09-02 and 2025-09-18. No additional upstream merges exist in the last 90 days, so the analysis below covers **all available upstream merge attempts**.

| Commit | Date | Files changed | Insertions | Deletions | Notes |
|--------|------|---------------|-----------|-----------|-------|
| `b29eca4e` | 2025-09-18 | 230 | 13452 | 15174 | Merge upstream vibe-kanban updates (76 commits) (#3) |
| `4647853d` | 2025-09-18 | 16 | 278 | 198 | Merge upstream/main (46d3f3c7) into branch with pnpm guardrails |
| `c239b3aa` | 2025-09-18 | 52 | 1331 | 800 | Merge upstream/main into upstream-merge-20250917-173057 honoring fork customizations |
| `8acfc749` | 2025-09-17 | 194 | 10879 | 14369 | Merge upstream vibe-kanban (76 new commits) |
| `3185ac62` | 2025-09-10 | 58 | 4202 | 526 | merge from upstream and omni modal to nicemodal |
| `6e8785b7` | 2025-09-08 | 74 | 4257 | 3863 | merge: upstream |
| `b876f9f5` | 2025-09-06 | 126 | 7409 | 3687 | Merge branch 'main' of upstream vibe-kanban |
| `3d2d40f6` | 2025-09-03 | 52 | 815 | 626 | Merge upstream/main - keep automagik-forge v0.3.6 naming and versioning |
| `576ae2ba` | 2025-09-02 | 71 | 4147 | 1532 | merge: sync with upstream vibe-kanban v0.0.73 |

## Recurring conflict zones

### 1. Task & follow-up lifecycle (schema + API + UI)
- Appears in merges `576ae2ba`, `3d2d40f6`, `3185ac62`, `4647853d`, `b29eca4e`.
- Files: `crates/db/src/models/task.rs`, `task_attempt.rs`, SQLx metadata, `crates/server/src/routes/tasks.rs`, `task_attempts.rs`, `frontend/src/components/tasks/TaskFollowUpSection.tsx`, `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`, `shared/types.ts`.
- Conflict driver: fork adds branch template fields and follow-up UX, upstream refactors the same structures.
- Resolution pattern: preserve fork-only fields (branch template, Omni hooks), then replay upstream enum/struct changes (`3185ac62`, `4647853d`).

### 2. Omni notification stack
- Introduced by commits `edfa30e4`, `66196ef7`, `a3c8c7ff` and merged through `3185ac62`, `8acfc749`, `c239b3aa`.
- Files: `crates/services/src/services/omni/*`, `config/versions/v7.rs`, `crates/server/src/routes/omni.rs`, `frontend/src/components/omni/*`, `frontend/src/pages/settings/GeneralSettings.tsx`.
- Conflict driver: upstream has no Omni feature, but touches adjacent config structures and settings UIs that the fork now owns.
- Resolution pattern: manual reapplication of Omni-specific wiring after upstream rewrites config or settings pages (`c239b3aa`, `8acfc749`).

### 3. Git services and worktree management
- Highlighted in `576ae2ba`, `b876f9f5`, `c239b3aa`, `8acfc749`.
- Files: `crates/services/src/services/git.rs`, `worktree_manager.rs`, `crates/services/tests/git_workflow.rs`, `crates/local-deployment/src/container.rs`.
- Conflict driver: both upstream and fork iterate on git safety guarantees; fork also injects custom worktree behaviour for branch templates.
- Resolution pattern: adopt upstream safety fixes, then reapply fork-specific logging and template propagation (`b876f9f5`, `c239b3aa`).

### 4. Release automation & dependency manifests
- Present in `b29eca4e`, `4647853d`, `3d2d40f6`, `b876f9f5`.
- Files: `.github/workflows/*.yml`, `.github/actions/setup-node/action.yml`, `Makefile`, `gh-build.sh`, `package.json`, `frontend/package.json`, `pnpm-lock.yaml`, root/ crate `Cargo.toml` files.
- Conflict driver: fork runs bespoke npm publish + multi-platform builds, upstream constantly evolves workflows and dependency pins.
- Resolution pattern: keep Automagik Forge workflow files (retain npm publish, Windows OpenSSL patch) while cherry-picking upstream reliability fixes (`b876f9f5`, `4647853d`).

### 5. Frontend dialog/navigation framework
- Appears in `6e8785b7`, `3185ac62`, `8acfc749`, `b29eca4e`.
- Files: `frontend/src/components/dialogs/**`, `layout/navbar.tsx`, `frontend/src/components/ui/{button,dialog}.tsx`, `frontend/src/pages/project-tasks.tsx`, `frontend/src/styles/index.css`.
- Conflict driver: fork reorganised dialogs into dedicated namespaces and added Omni UI; upstream continues to redesign modals and tasks screens.
- Resolution pattern: accept upstream structural improvements, then reapply forge-specific layout, branding and Omni entry points (`6e8785b7`, `3185ac62`).

## Resolution strategies observed
- **Preserve fork feature flags:** merge commit messages explicitly note keeping Automagik Forge versioning and branding (`b876f9f5`, `3d2d40f6`).
- **Replay fork patches post-merge:** large merges (`8acfc749`, `b29eca4e`) show fork scripts restoring Omni config, CLAUDE automation, and release workflows after upstream rewrites.
- **Manual schema reconciliation:** merges `4647853d` and `3185ac62` regenerate SQLx metadata and rerun type generation to sync Task/TaskAttempt models.
- **UI regression testing:** follow-up commits immediately after merges (`a1716cc2`, `b893b6b1`) fix Omni modal regressions introduced during conflict resolution.

## Effort outlook
- **Large-scale merges:** `b29eca4e` and `8acfc749` each modified >190 files and >10k lines — multi-day efforts with high review load.
- **Medium merges:** `3185ac62`, `6e8785b7`, `c239b3aa` average 50–75 files, 4k insertions; expect several engineer-days including verification.
- **Quick merges:** `4647853d`, `3d2d40f6`, `576ae2ba` modify ≤16 files but touch sensitive schema/config areas requiring targeted testing.

## Risk mitigation recommendations
1. **Pre-merge diff audit:** generate SQLx metadata and TypeScript types before merging to surface schema drift early.
2. **Workflow isolation:** factor fork-only CI (publish, Makefile, gh-build) into separate reusable actions to reduce repeated conflicts.
3. **Feature toggles for Omni & branch templates:** gating fork features simplifies future upstream alignment if upstream ships competing solutions.
4. **Frontend module boundaries:** encapsulate Omni dialogs and Task follow-up widgets into lazy-loaded packages to minimise cross-file churn during upstream UI refactors.
