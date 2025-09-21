# WISH: Migrate Automagik Forge Fork to Upstream-as-Library Architecture

<task_breakdown>
1. [Discovery] Baseline and structure
   - Catalogue forge-only changes across backend, frontend, build, and docs.
   - Compare `origin/main` with `upstream/main` to verify the 143-file delta; capture hot spots for each task.
   - Decide final workspace layout and document developer bootstrap commands before touching upstream code.

2. [Implementation] Feature extraction and composition
   - Introduce `upstream/` submodule, `forge-extensions/*`, `forge-app/`, and `frontend-forge/` without breaking builds.
   - Extract Omni, branch templates, config v7, Genie, and supporting migrations/services into the extension layer.
   - Wire new APIs and dual-frontend routing while keeping upstream untouched.

3. [Verification] Validation and cutover readiness
   - Run cargo, pnpm, SQL migration checks, and HTTP smoke tests each phase; store transcripts in prep docs.
   - Execute submodule update drills and upstream diff audits prior to release.
   - Execute regression harness against forge snapshot data; document rollback steps, open risks, and downstream follow-ups for Tasks 2–3.
</task_breakdown>

[SUCCESS CRITERIA]
✅ Upstream `vibe-kanban` lives under `upstream/` as a clean submodule; no direct edits.
✅ `forge-app` and all `forge-extensions/*` crates compile, lint, and test alongside upstream members.
✅ Auxiliary tables and migrations preserve data with idempotent guards and reversible steps.
✅ Forge UI and upstream UI run concurrently (`/` vs `/legacy`) via `forge-app`.
✅ Verification commands from Tasks 1–3 are executed (or sandbox-limited) and logged in prep docs.
✅ Regression harness proves feature parity against snapshot data from `~/.automagik-forge/` before and after migration.

[NEVER DO]
❌ Modify code inside `upstream/` after submodule creation (contribute upstream instead).
❌ Drop forge functionality, data, or tests without documented replacement and rollback plan.
❌ Ship non-idempotent SQL migrations or destructive updates without backups.
❌ Diverge from shared workspace dependency management (no duplicate crate versions).
❌ Skip upstream diff checks before cutover; always reconcile with `git fetch upstream && git diff upstream/main`.
❌ Skip regression harness or baseline maintenance before declaring readiness.
❌ Commit `dev_assets_seed/forge-snapshot/from_home/` or any personal snapshot data.
❌ Author git commits, push branches, or open pull requests—hand off code-ready changes for maintainers to review.

## 🎯 Objective
Migrate the existing automagik-forge fork (143 modified files, 11k+ changes) to a new architecture using upstream vibe-kanban as an untouched library, while preserving ALL current forge features and reducing merge conflicts from 13-23 hours to near-zero.

## 📌 Baseline Snapshot – Captured 2025-09-21

**Git / Workspace**
- Active branch `restructure/upstream-as-library-migration` at HEAD `781fc66c117f11a7e68ef97eab1fb22e1fd3a7ad`.
- Working tree contains this wish and supporting prep artifacts (`docs/regression/`, `docs/upstream-diff-*.{txt,log,patch}`, `prompt-task{1,2,3}.md`, `scripts/run-*.sh`).
- Upstream diff audit artefacts already match `docs/upstream-diff-latest.txt`.

**Tooling Versions**
- `rustc 1.89.0 (29483883e 2025-08-04)` / `cargo 1.89.0 (c24e10642 2025-06-23)`.
- `node v22.16.0`, `pnpm 10.12.4` (workspace rules disallow lockfile mutation; install runs read-only).

**Backend & Frontend Health**
- `cargo test --workspace` ✅ (db/unit suites: 2 db tests, 59 executor tests, 28 git worktree tests, 27 git workflow tests, full pass in ~42s).
- `pnpm run check` ✅ (frontend `tsc --noEmit` + `cargo check`).
- `pnpm run build:npx` ✅ producing linux-x64 bundles; acknowledged Vite chunk-size warning (baseline condition, no regressions) and successful Sentry sourcemap upload.
- No top-level `pnpm run build` script exists today (expected failure; stick with `build:npx` during parity checks).

**Package Artifacts**
- `npx-cli/dist/linux-x64/automagik-forge.zip` → SHA256 `8699edcd26c6f81e1c4171fddcc29cd0cb132275565d076667535ee62c0b74fb`.
- `npx-cli/dist/linux-x64/automagik-forge-mcp.zip` → SHA256 `7218d1299ebaee920ad9deabd844ec8acd1ef982c1d6349eda479fc78acc042f`.
- Full command transcripts stored under `docs/regression/logs/` with summary + hashes in `docs/regression/baseline/` (see `README.md` and `checksums.txt`).

**Runtime Data Fixtures**
- Local workspace fixtures live in `dev_assets/{config.json,db.sqlite}`; committed seeds live in `dev_assets_seed/forge-snapshot/from_repo/`.
- Personal snapshot (`~/.automagik-forge/`) must be copied locally via `./scripts/collect-forge-snapshot.sh`; the resulting `from_home/` directory is git-ignored to keep secrets and large binaries out of history.
- `~/.automagik-forge/db.sqlite` size 92.6 MB, SHA256 `53400c4e69db75a9629c1f7cbc69cc8df6ce6fb60cebd8434f0e85ea4aac8185` (access/mod 2025-09-21 13:03:19 BRT) — record for parity but not stored in the repo.

**Baseline Sign-off**
- All gating commands above are green as of 2025-09-21T16:45Z; treat these hashes, versions, and command transcripts as the gold reference for migration parity and regression comparisons.

**Local Snapshot Handling**
- Populate `dev_assets_seed/forge-snapshot/from_home/` locally with `./scripts/collect-forge-snapshot.sh` (defaults to `~/.automagik-forge`).
- The generated files are git-ignored; agents must run the script before executing regression harnesses or data migrations.
- Re-run the script whenever baseline data changes; record updated hashes externally if parity expectations shift.

### Verification Commands Per Task
- **Task 1**: `cargo check --workspace`; `cargo check -p forge-app`; `pnpm install` (or document sandbox restrictions); `git submodule status upstream`.
- **Task 2**: `cargo fmt`; `cargo clippy --workspace --all-targets`; `cargo test -p forge-extensions-omni`; `sqlx migrate run --dry-run`; `curl http://localhost:8887/api/forge/omni/instances`.
- **Task 3**: `pnpm run lint`; `pnpm run build`; `cargo test --workspace` (or targeted crates including Genie); `cargo run -p forge-app` followed by `curl` smoke checks for `/health`, `/legacy`, `/api/forge/genie/wishes`.
- **Ongoing**: `git fetch upstream && git diff upstream/main...origin/main --stat`; `cd upstream && git pull --ff-only` to validate submodule cleanliness.
- **Regression**: Populate `dev_assets_seed/forge-snapshot/from_home/` with `./scripts/collect-forge-snapshot.sh`, then run `./scripts/run-forge-regression.sh` to exercise CLI, API, and key UI flows against snapshot data.

**Tooling prerequisites:** `jq`, `pnpm`, and `curl` must be available for regression scripts.
Set `FORGE_SAMPLE_TASK_ID` if the snapshot requires a specific task identifier for branch template checks.

## Migration Tasks & Guarantees

### Task 1 – Scaffold
- Create submodule structure, empty crates, and updated manifests/scripts per prompt.
- Run `./scripts/run-upstream-audit.sh` and capture summary in docs.
- Archive current forge data by running `./scripts/collect-forge-snapshot.sh` (copies `~/.automagik-forge/` into the git-ignored `dev_assets_seed/forge-snapshot/from_home/`) and verifying committed seeds remain untouched in `from_repo/`.
- Data preservation note: Production data can be reset—capture snapshot for parity checks only; no requirement to migrate historic data in-place.
- Confirm repository still builds (`cargo check --workspace`, `pnpm install`).

### Task 2 – Backend Extraction & Data Lifting
- Extract Omni, branch template, config v7, and Genie logic into extension crates.
- Create auxiliary tables & migrations with idempotent guards for branch templates, Omni settings, Genie metadata, and config snapshots.
- Copy existing forge data from the locally populated snapshot (`dev_assets_seed/forge-snapshot/from_home/` generated by `collect-forge-snapshot.sh`) into auxiliary tables using dedicated migrations/scripts; acceptable to re-import from `~/.automagik-forge/forge.sqlite` fixture if live DB reset is fine.
- Replace downstream hooks in upstream crates with composition layer adapters.
- Implement regression harness back-end checks:
  - Seed DB with fixture (import script provided).
  - Call Omni webhook simulation, branch template CRUD, config read/write, Genie command metadata.
  - Compare baseline JSON payloads to stored golden files under `docs/regression/baseline/`.
- Commit `docs/regression/baseline` artifacts capturing expected JSON responses for parity assertions.
- Update docs with migration runbook & rollback (restore from snapshot, rerun upstream build).

### Task 3 – Frontend, CLI, and End-to-End Validation
- Relocate forge UI components into `frontend-forge/` and ensure API clients target `/api/forge/*` endpoints.
- Serve upstream UI under `/legacy` and confirm static asset parity (logos, service worker, theme).
- Finish Genie extraction, exposing `/api/forge/genie/*` endpoints and bridging CLI commands.
- Run full CLI pipeline: `pnpm run build:npx`, `pnpm pack --filter npx-cli`, install using `npm install -g dist.tgz`, and smoke test (`npx automagik-forge --version`, project init, Omni trigger).
- Execute regression harness front-end suite (Playwright/curl) comparing DOM snapshots and key API responses to baselines.
- Update `docs/regression/baseline` if intentional changes are introduced; otherwise ensure `./scripts/run-forge-regression.sh` diff passes cleanly.
- Document release process updates (CI jobs, Docker build, npm publish) confirming they point at new binaries.

## 📊 Current Fork State Analysis

### Existing Modifications (To Be Migrated)
- **Omni Notification System**: Complete feature in `crates/services/src/services/omni/`
- **Branch Templates**: Database field added to tasks table + UI components
- **Genie/Claude Integration**: `.claude/` directory with commands and agents
- **Config v7**: Extended configuration system with Omni support
- **Custom Build Pipeline**: Makefile, gh-build.sh, modified workflows
- **NPM Publishing**: CLI wrapper in `npx-cli/` for MCP server distribution
- **Frontend Modifications**: 39+ UI files with branding and feature changes

### Migration Requirements
- Preserve ALL existing forge features without loss
- Migrate modified database schema to auxiliary tables
- Extract embedded backend modifications to composition layer
- Move frontend changes to new frontend app
- Maintain npm package publishing capability
- Keep MCP server functionality intact
- Ensure zero data loss during migration

#### Upstream Diff Drill
Run the following before each phase lands to quantify the gap against upstream. (If the environment blocks network egress—as in our sandbox—note the limitation in prep docs and rerun locally.)

```bash
git fetch upstream
git checkout origin/main
git diff upstream/main...origin/main --stat
git diff upstream/main...origin/main --name-status | tee docs/upstream-diff-latest.txt
```

Capture top offenders (e.g., omni services, branch template models, Genie automation) and reference them in task notes so extraction progress is measurable.

**Helper:** run `./scripts/run-upstream-audit.sh` to execute the full command set and write outputs to `docs/upstream-diff-latest.txt`, `docs/upstream-diff-full.patch`, and the fetch log.

## 🏗️ Architecture Design

```
automagik-forge/
├── upstream/                    # Git submodule (NEVER TOUCH)
│   ├── crates/                 # Their backend
│   ├── frontend/               # Their UI
│   └── [everything untouched]
│
├── forge-extensions/           # YOUR ADDITIONS
│   ├── omni/                  # Omni notifications
│   ├── genie/                 # Genie automation
│   ├── branch-templates/      # Branch template feature
│   └── services/              # Service compositions
│
├── forge-overrides/           # YOUR REPLACEMENTS (only when needed)
│   └── (empty initially)      # Add only for conflicts
│
├── forge-app/                 # MAIN APPLICATION
│   ├── Cargo.toml            # Combines everything
│   └── src/
│       ├── main.rs           # Application entry
│       └── router.rs         # Dual frontend routing
│
├── frontend-forge/            # NEW FRONTEND
│   ├── src/                  # Your new UI vision
│   └── package.json
│
├── npx-cli/                   # NPM PACKAGE (unchanged)
│   └── bin/cli.js            # CLI wrapper
│
└── Cargo.toml                # Root workspace
```

## 💾 Database Strategy

### Auxiliary Tables Pattern
```sql
-- Upstream tables remain untouched
-- All extensions in separate tables with foreign keys

CREATE TABLE IF NOT EXISTS forge_task_extensions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings JSONB,
    genie_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forge_project_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors JSONB,
    forge_config JSONB
);

CREATE TABLE IF NOT EXISTS forge_omni_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    notification_type TEXT,
    settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Views for convenient access
CREATE VIEW IF NOT EXISTS enhanced_tasks AS
SELECT
    t.*,
    fx.branch_template,
    fx.omni_settings,
    fx.genie_metadata
FROM tasks t
LEFT JOIN forge_task_extensions fx ON t.id = fx.task_id;
```

## 🔧 Backend Composition Pattern

```rust
// forge-extensions/src/services/task_service.rs
use upstream::services::TaskService as UpstreamTaskService;

pub struct ForgeTaskService {
    upstream: UpstreamTaskService,
    db: SqlitePool,
    omni: Option<OmniService>,
}

impl ForgeTaskService {
    pub fn new(upstream: UpstreamTaskService, db: SqlitePool, omni: Option<OmniService>) -> Self {
        Self { upstream, db, omni }
    }

    // Use upstream unchanged
    pub async fn list_tasks(&self, project_id: i64) -> Result<Vec<Task>> {
        self.upstream.list_tasks(project_id).await
    }

    // Enhance upstream behavior
    pub async fn create_task(&self, data: CreateTask) -> Result<Task> {
        // Create via upstream
        let task = self.upstream.create_task(data.core).await?;

        // Add forge extensions
        if let Some(template) = data.branch_template {
            sqlx::query!(
                "INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
                task.id,
                template
            )
            .execute(&self.db)
            .await?;
        }

        // Trigger forge features
        if let Some(omni) = &self.omni {
            omni.notify_task_created(&task).await?;
        }

        Ok(task)
    }

    // Add completely new methods
    pub async fn create_task_v2(&self, data: EnhancedCreateTask) -> Result<Task> {
        // Totally different implementation
        // Not constrained by upstream
    }
}
```

## 🎨 Frontend Router Strategy

```rust
// forge-app/src/router.rs
use axum::{Router, routing::get};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
struct ForgeFrontend;

#[derive(RustEmbed)]
#[folder = "../upstream/frontend/dist"]
struct LegacyFrontend;

pub fn create_router(services: ForgeServices) -> Router {
    Router::new()
        // API routes (composed services)
        .nest("/api", api_router(services))

        // Legacy frontend at /legacy
        .nest("/legacy", legacy_frontend_router())

        // New frontend at root
        .fallback(forge_frontend_router())
}

fn forge_frontend_router() -> Router {
    Router::new()
        .route("/*path", get(serve_forge_frontend))
        .route("/", get(serve_forge_index))
}

fn legacy_frontend_router() -> Router {
    Router::new()
        .route("/*path", get(serve_legacy_frontend))
        .route("/", get(serve_legacy_index))
}
```

## 📦 Build & Publishing

### Workspace Configuration
```toml
# /Cargo.toml
[workspace]
members = [
    "upstream/crates/*",
    "forge-extensions/*",
    "forge-overrides/*",
    "forge-app"
]

# Override only when absolutely necessary
[patch.crates-io]
# vibe-server = { path = "forge-overrides/server" }  # Only if needed
```

### Build Script Updates
```bash
#!/bin/bash
# build.sh

# Build upstream (for legacy UI)
(cd upstream/frontend && pnpm build)

# Build new frontend
(cd frontend-forge && pnpm build)

# Build Rust with both frontends embedded
cargo build --release --bin forge-app

# Package for npm (unchanged)
./package-npm.sh
```

## 🚀 Migration Execution Strategy

### Phase 1: Repository Structure Setup
```bash
# Work in migration branch
git checkout -b migration/upstream-library

# Add upstream as submodule
git submodule add https://github.com/BloopAI/vibe-kanban.git upstream
cd upstream && git checkout main && cd ..

# Create new structure
mkdir -p forge-{extensions,overrides,app}/src
mkdir -p frontend-forge/src
```

### Phase 2: Extract Current Modifications

#### 2.1 Extract Omni System
```bash
# Analyze omni modifications
git diff upstream/main...HEAD -- '**/omni*' > omni-changes.diff

# Extract to forge-extensions
mkdir -p forge-extensions/omni/src/{services,routes}
cp -r crates/services/src/services/omni/* forge-extensions/omni/src/services/
cp crates/server/src/routes/omni.rs forge-extensions/omni/src/routes/

# Create Cargo.toml for omni extension
cat > forge-extensions/omni/Cargo.toml << 'EOF'
[package]
name = "forge-omni"
version = "0.1.0"

[dependencies]
upstream-services = { path = "../../upstream/crates/services" }
sqlx = { workspace = true }
reqwest = { workspace = true }
EOF
```

#### 2.2 Extract Branch Templates
```bash
# Extract branch template feature
mkdir -p forge-extensions/branch-templates/src

# Create extension trait over upstream Task
cat > forge-extensions/branch-templates/src/lib.rs << 'EOF'
use upstream::db::models::Task;

pub trait BranchTemplateExt {
    async fn get_branch_template(&self) -> Option<String>;
    async fn set_branch_template(&mut self, template: String);
}

impl BranchTemplateExt for Task {
    async fn get_branch_template(&self) -> Option<String> {
        // Query auxiliary table
        sqlx::query_scalar!(
            "SELECT branch_template FROM forge_task_extensions WHERE task_id = ?",
            self.id
        ).fetch_optional(&*DB_POOL).await.ok()?
    }
}
EOF
```

> **Recommendation:** replace the implicit `DB_POOL` singleton with a constructor-injected store so tests and services can provide scoped connections. For example:

```rust
pub struct BranchTemplateStore {
    pool: SqlitePool,
}

impl BranchTemplateStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn fetch(&self, task_id: i64) -> Result<Option<String>> {
        let template = sqlx::query_scalar!(
            "SELECT branch_template FROM forge_task_extensions WHERE task_id = ?",
            task_id
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(template)
    }

    pub async fn upsert(&self, task_id: i64, template: &str) -> Result<()> {
        sqlx::query!(
            "INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
            task_id,
            template
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
```

#### 2.3 Extract Config v7
```bash
# Extract config extensions
mkdir -p forge-extensions/config/src

cat > forge-extensions/config/src/lib.rs << 'EOF'
use upstream::services::config as upstream_config;

#[derive(Clone, Serialize, Deserialize)]
pub struct ForgeConfig {
    #[serde(flatten)]
    pub base: upstream_config::Config,
    pub omni: Option<OmniConfig>,
    pub branch_templates_enabled: bool,
}
EOF
```

### Phase 3: Bootstrap Composition Layer

#### 3.1 Create Main App Compositor
```rust
// forge-app/src/main.rs
use upstream::server::Server as UpstreamServer;
use forge_extensions::{omni::OmniService, branch_templates::BranchTemplateService};

pub struct ForgeApp {
    upstream: UpstreamServer,
    omni: OmniService,
    branch_templates: BranchTemplateService,
}

impl ForgeApp {
    pub fn new() -> Self {
        Self {
            upstream: UpstreamServer::new(),
            omni: OmniService::new(),
            branch_templates: BranchTemplateService::new(),
        }
    }

    pub async fn run(self) -> Result<()> {
        // Compose services
        let router = self.compose_router();
        axum::Server::bind(&"0.0.0.0:8887".parse()?)
            .serve(router.into_make_service())
            .await?;
        Ok(())
    }
}
```

> **Composition note:** in production wire-up, pass database pools and upstream services into `ForgeApp::new` rather than constructing globals inside the method. The scaffolding example keeps the snippet short; Task 2 should replace it with dependency-injected builders tied to configuration.

#### 3.2 Service Composition Pattern
```rust
// forge-app/src/services/task_service.rs
use upstream::services::TaskService as UpstreamTaskService;

pub struct ForgeTaskService {
    upstream: UpstreamTaskService,
    extensions_db: SqlitePool, // For auxiliary tables
    omni: Option<OmniService>,
}

impl ForgeTaskService {
    // Pass through unchanged methods
    pub async fn get_task(&self, id: i64) -> Result<Task> {
        self.upstream.get_task(id).await
    }

    // Enhance methods that need extensions
    pub async fn create_task(&self, data: CreateTask) -> Result<Task> {
        // Extract forge-specific fields
        let branch_template = data.branch_template.clone();

        // Create via upstream
        let task = self.upstream.create_task(data).await?;

        // Store extensions in auxiliary table
        if let Some(template) = branch_template {
            sqlx::query!(
                "INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
                task.id,
                template
            )
            .execute(&self.extensions_db)
            .await?;
        }

        // Trigger forge features
        if let Some(omni) = &self.omni {
            omni.notify_task_created(&task).await?;
        }

        Ok(task)
    }
}
```

### Phase 4: Database Migration to Auxiliary Tables

#### 4.1 Create Auxiliary Schema
```sql
-- forge-app/migrations/001_auxiliary_tables.sql
CREATE TABLE IF NOT EXISTS forge_task_extensions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings JSONB,
    genie_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forge_project_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors JSONB,
    forge_config JSONB
);

-- Compatibility views
CREATE VIEW IF NOT EXISTS enhanced_tasks AS
SELECT
    t.*,
    fx.branch_template,
    fx.omni_settings
FROM tasks t
LEFT JOIN forge_task_extensions fx ON t.id = fx.task_id;
```

#### 4.2 Migrate Existing Data
```sql
-- forge-app/migrations/002_migrate_data.sql
-- Migrate branch_template from tasks to auxiliary
INSERT OR IGNORE INTO forge_task_extensions (task_id, branch_template)
SELECT id, branch_template
FROM tasks
WHERE branch_template IS NOT NULL;

UPDATE tasks
SET branch_template = NULL
WHERE branch_template IS NOT NULL;

-- Optional: migrate Omni + Genie JSON blobs if present in upstream tables
INSERT OR REPLACE INTO forge_task_extensions (task_id, omni_settings, genie_metadata)
SELECT id,
       omni_settings,
       genie_metadata
FROM tasks
WHERE omni_settings IS NOT NULL OR genie_metadata IS NOT NULL;

-- Optional: migrate project-level config metadata (if stored upstream)
INSERT OR REPLACE INTO forge_project_settings (project_id, forge_config)
SELECT id, config_override
FROM projects
WHERE config_override IS NOT NULL;
```

### Phase 5: Frontend Dual Routing

#### 5.1 Configure Dual Frontend Serving
```rust
// forge-app/src/router.rs
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../frontend-forge/dist"]
struct ForgeFrontend;

#[derive(RustEmbed)]
#[folder = "../upstream/frontend/dist"]
struct LegacyFrontend;

pub fn create_router() -> Router {
    Router::new()
        // API routes (composed services)
        .nest("/api", api_router())

        // Legacy frontend at /legacy
        .nest("/legacy", serve_embedded::<LegacyFrontend>())

        // New frontend at root
        .fallback(serve_embedded::<ForgeFrontend>())
}
```

### Phase 6: Update Build & CI/CD

#### 6.1 Update Workspace Cargo.toml
```toml
[workspace]
members = [
    "upstream/crates/*",      # Their code
    "forge-extensions/*",      # Our additions
    "forge-app"               # Main app
]

# Patch only if absolutely necessary
[patch.crates-io]
# upstream-server = { path = "forge-overrides/server" }
```

#### 6.2 Update Build Scripts
```bash
# local-build.sh modifications
#!/bin/bash

# Build upstream frontend (for /legacy)
(cd upstream/frontend && pnpm build)

# Build new frontend
(cd frontend-forge && pnpm build)

# Build Rust with both frontends
cargo build --release --bin forge-app

# Package for npm (unchanged paths)
./package-npm.sh
```

### Phase 7: Validation & Testing

#### 7.1 Feature Validation Checklist
```bash
# Test all forge features
- [ ] Omni notifications send successfully
- [ ] Branch templates create and apply
- [ ] MCP server responds correctly
- [ ] NPM package installs and runs
- [ ] Both frontends accessible (/legacy and /)
- [ ] All API endpoints return expected data
- [ ] Regression harness passes (backend + frontend suites)
- [ ] CLI smoke tests (`npx automagik-forge --help`, project init) succeed
- [ ] Snapshot diff against baseline under docs/regression/ reports no changes
```

#### 7.2 Upstream Update Test
```bash
# Test that upstream updates work
cd upstream
git pull origin main
cd ..
cargo build --release

# Should compile without conflicts
```

## ✅ Success Metrics
- Upstream updates: `cd upstream && git pull` (no conflicts)
- Both frontends accessible simultaneously
- Zero modifications to upstream code
- npm package publishes successfully
- All forge features working via composition
- Regression harness passes with zero diffs (backend, frontend, CLI)

## 🎯 Maintenance Benefits
- **Merge time**: 13-23 hours → ~0 hours
- **Conflict rate**: 143 files → 0 files
- **Update control**: Pull upstream only when YOU want
- **Code clarity**: Clear separation of upstream vs forge
- **Future flexibility**: Can diverge completely anytime

## 🚦 Complete Migration Checklist

### Pre-Migration
- [ ] Create full backup branch
- [ ] Document all current modifications
- [ ] Backup database with production data
- [ ] Notify team of migration plan
- [ ] Create rollback procedure
- [ ] Run `./scripts/collect-forge-snapshot.sh` to stage local snapshot (kept out of git)

### Structure Migration
- [ ] Add upstream as git submodule
- [ ] Create forge-extensions directory structure
- [ ] Set up forge-app composition layer
- [ ] Create frontend-forge alongside current frontend
- [ ] Update workspace Cargo.toml

### Feature Extraction
- [ ] Extract Omni notification system to forge-extensions
- [ ] Extract branch template logic to auxiliary handlers
- [ ] Extract config v7 to forge-extensions
- [ ] Extract Genie/Claude integrations
- [ ] Extract custom build scripts

### Database Migration
- [ ] Create auxiliary tables schema
- [ ] Write data migration scripts
- [ ] Migrate existing branch_template data
- [ ] Create compatibility views
- [ ] Test data integrity
- [ ] Create rollback scripts

### Frontend Migration
- [ ] Extract custom components to frontend-forge
- [ ] Migrate branding assets
- [ ] Set up dual frontend routing
- [ ] Test feature parity between old and new UI
- [ ] Migrate custom styles and themes

### Integration Testing
- [ ] Test Omni notifications end-to-end
- [ ] Verify branch templates work
- [ ] Test MCP server functionality
- [ ] Validate npm package builds correctly
- [ ] Test GitHub Actions workflows
- [ ] Verify all API endpoints work
- [ ] Test database queries with auxiliary tables

### Cutover
- [ ] Final data sync
- [ ] Switch DNS/routing to new architecture
- [ ] Monitor for errors
- [ ] Keep old code for 30-day rollback window
- [ ] Document any issues found

### Post-Migration
- [ ] Remove old code after stability period
- [ ] Update all documentation
- [ ] Train team on new architecture
- [ ] Create maintenance procedures

## ⚠️ Migration Risks & Mitigations

### High Risk Areas
1. **Data Loss During Migration**
   - **Mitigation**: Full backup, parallel running, data validation scripts
   - **Rollback**: Keep original database structure for 30 days

2. **Feature Regression**
   - **Mitigation**: Comprehensive test suite before cutover
   - **Rollback**: Old code remains functional during migration

3. **Build Pipeline Breakage**
   - **Mitigation**: Test npm publishing in staging first
   - **Rollback**: Keep old build scripts until verified

### Medium Risk Areas
1. **API Compatibility Issues**
   - **Mitigation**: Run both APIs in parallel initially
   - **Testing**: Automated API comparison tests

2. **Performance Degradation**
   - **Mitigation**: Benchmark before and after
   - **Solution**: Optimize composition layer if needed

### Low Risk Areas
1. **UI Differences**
   - **Mitigation**: Side-by-side comparison available
   - **Solution**: Iterative refinement post-migration

## 📝 Notes on Current Fork Modifications

Based on analysis, the fork currently has:
- **69 high-risk files** (core backend/database modifications)
- **32 medium-risk files** (service extensions)
- **16 low-risk files** (UI/branding)
- **26 fork-only files** (new features like Genie)

All these modifications will be preserved and migrated to the new architecture without loss of functionality.

---

*This migration plan ensures a safe transition from a heavily modified fork to a maintainable architecture with zero upstream conflicts, while preserving all existing features and data.*
