# WISH: Migrate Automagik Forge Fork to Upstream-as-Library Architecture

## 🎯 Objective
Migrate the existing automagik-forge fork (143 modified files, 11k+ changes) to a new architecture using upstream vibe-kanban as an untouched library, while preserving ALL current forge features and reducing merge conflicts from 13-23 hours to near-zero.

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
├── frontend/                  # NEW FRONTEND
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

CREATE TABLE forge_task_extensions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings JSONB,
    genie_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE forge_project_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors JSONB,
    forge_config JSONB
);

CREATE TABLE forge_omni_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    notification_type TEXT,
    settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Views for convenient access
CREATE VIEW enhanced_tasks AS
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
}

impl ForgeTaskService {
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
                "INSERT INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
                task.id,
                template
            ).execute(&self.db).await?;
        }

        // Trigger forge features
        if data.notify_omni {
            self.omni_service.notify_task_created(&task).await?;
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
(cd frontend && pnpm build)

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
mkdir -p frontend-new/src
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

#### 3.2 Service Composition Pattern
```rust
// forge-app/src/services/task_service.rs
use upstream::services::TaskService as UpstreamTaskService;

pub struct ForgeTaskService {
    upstream: UpstreamTaskService,
    extensions_db: SqlitePool, // For auxiliary tables
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
                "INSERT INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
                task.id, template
            ).execute(&self.extensions_db).await?;
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
CREATE TABLE forge_task_extensions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings JSONB,
    genie_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE forge_project_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors JSONB,
    forge_config JSONB
);

-- Compatibility views
CREATE VIEW enhanced_tasks AS
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
INSERT INTO forge_task_extensions (task_id, branch_template)
SELECT id, branch_template
FROM tasks
WHERE branch_template IS NOT NULL;
```

### Phase 5: Frontend Dual Routing

#### 5.1 Configure Dual Frontend Serving
```rust
// forge-app/src/router.rs
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../frontend-new/dist"]
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
(cd frontend-new && pnpm build)

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

### Structure Migration
- [ ] Add upstream as git submodule
- [ ] Create forge-extensions directory structure
- [ ] Set up forge-app composition layer
- [ ] Create frontend-new alongside current frontend
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
- [ ] Extract custom components to frontend-new
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