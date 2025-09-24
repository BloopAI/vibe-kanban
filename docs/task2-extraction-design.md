# Task 2 - Backend Extension Design

## Overview
Design document for extracting forge-specific backend features into extension crates while maintaining upstream compatibility.

## 1. Extension Crate APIs

### forge-extensions/omni
```rust
// Public API
pub struct OmniService {
    config: OmniConfig,
    client: OmniClient,
}

impl OmniService {
    pub fn new(config: OmniConfig) -> Self;
    pub async fn send_task_notification(&self, task_title: &str, task_status: &str, task_url: Option<&str>) -> Result<()>;
    pub async fn list_instances(&self) -> Result<Vec<OmniInstance>>;
}

// Re-export all types for external use
pub use types::*;
```

### forge-extensions/branch-templates
```rust
// Public API
pub struct BranchTemplateService {
    pool: SqlitePool,
}

impl BranchTemplateService {
    pub fn new(pool: SqlitePool) -> Self;
    pub async fn get_template(&self, task_id: Uuid) -> Result<Option<String>>;
    pub async fn set_template(&self, task_id: Uuid, template: Option<String>) -> Result<()>;
    pub fn generate_branch_name(&self, task: &Task, attempt_id: &Uuid) -> String;
}
```

### forge-extensions/config
```rust
// Public API - maintains compatibility with existing config system
pub use crate::services::config::{Config, load_config_from_file, save_config_to_file};

// Extends with forge-specific functionality
pub struct ForgeConfigService {
    pool: SqlitePool,
}

impl ForgeConfigService {
    pub async fn get_project_config(&self, project_id: Uuid) -> Result<Option<serde_json::Value>>;
    pub async fn set_project_config(&self, project_id: Uuid, config: serde_json::Value) -> Result<()>;
}
```

## 2. Auxiliary Database Schema

### Migration 001: Core auxiliary tables
```sql
-- forge-app/migrations/001_auxiliary_tables.sql
CREATE TABLE IF NOT EXISTS forge_task_extensions (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings TEXT, -- JSON
    genie_metadata TEXT, -- JSON for future use
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forge_project_settings (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors TEXT, -- JSON
    forge_config TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forge_omni_notifications (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id),
    notification_type TEXT NOT NULL,
    settings TEXT NOT NULL, -- JSON
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Convenience views for enhanced access
CREATE VIEW IF NOT EXISTS enhanced_tasks AS
SELECT
    t.*,
    fx.branch_template,
    fx.omni_settings,
    fx.genie_metadata
FROM tasks t
LEFT JOIN forge_task_extensions fx ON t.id = fx.task_id;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_forge_task_extensions_task_id ON forge_task_extensions(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_project_settings_project_id ON forge_project_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_forge_omni_notifications_task_id ON forge_omni_notifications(task_id);
```

### Migration 002: Data migration
```sql
-- forge-app/migrations/002_migrate_data.sql
-- Migrate existing branch_template data to auxiliary table
INSERT OR IGNORE INTO forge_task_extensions (task_id, branch_template)
SELECT id, branch_template
FROM tasks
WHERE branch_template IS NOT NULL;

-- Note: We keep the original branch_template column for now
-- It will be nulled in a later migration after verification

-- Create triggers to maintain data consistency
CREATE TRIGGER IF NOT EXISTS sync_branch_template_insert
AFTER INSERT ON forge_task_extensions
WHEN NEW.branch_template IS NOT NULL
BEGIN
    UPDATE tasks SET branch_template = NEW.branch_template WHERE id = NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS sync_branch_template_update
AFTER UPDATE ON forge_task_extensions
WHEN NEW.branch_template != OLD.branch_template OR (NEW.branch_template IS NULL) != (OLD.branch_template IS NULL)
BEGIN
    UPDATE tasks SET branch_template = NEW.branch_template WHERE id = NEW.task_id;
END;
```

## 3. Composition Layer Design

### ForgeServices Container
```rust
// forge-app/src/services/mod.rs
pub struct ForgeServices {
    pub task_service: ForgeTaskService,
    pub omni_service: OmniService,
    pub branch_template_service: BranchTemplateService,
    pub config_service: ForgeConfigService,
}

impl ForgeServices {
    pub fn new(pool: SqlitePool, config: Config) -> Self {
        Self {
            task_service: ForgeTaskService::new(pool.clone()),
            omni_service: OmniService::new(config.omni),
            branch_template_service: BranchTemplateService::new(pool.clone()),
            config_service: ForgeConfigService::new(pool),
        }
    }
}
```

### ForgeTaskService - Composition over upstream
```rust
// forge-app/src/services/task_service.rs
pub struct ForgeTaskService {
    pool: SqlitePool,
}

impl ForgeTaskService {
    // Enhance task creation with forge features
    pub async fn create_task_with_extensions(&self, data: CreateTask) -> Result<Task> {
        // Create task using upstream logic (imported via db crate)
        let task = Task::create(&self.pool, &data).await?;

        // Store forge extensions
        if let Some(template) = &data.branch_template {
            sqlx::query!(
                "INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
                task.id,
                template
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(task)
    }

    // Generate branch names using extension logic
    pub async fn generate_attempt_branch(&self, task_id: Uuid, attempt_id: &Uuid) -> Result<String> {
        let task = Task::find_by_id(&self.pool, task_id).await?
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

        Ok(forge_branch_templates::generate_branch_name(&task, attempt_id))
    }
}
```

## 4. API Route Design

### New forge-specific endpoints
```rust
// forge-app/src/routes/mod.rs
pub fn forge_routes() -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/forge/omni/instances", get(list_omni_instances))
        .route("/api/forge/branch-templates/:task_id", get(get_branch_template))
        .route("/api/forge/branch-templates/:task_id", put(set_branch_template))
        .route("/api/forge/genie/wishes", get(list_genie_wishes_placeholder))
}
```

## 5. Migration Strategy

### Phase 1: Extract and scaffold (this task)
1. Move omni code to forge-extensions/omni
2. Move branch template logic to forge-extensions/branch-templates
3. Create auxiliary tables and migration scripts
4. Wire basic composition layer in forge-app

### Phase 2: Data migration
1. Run local snapshot collection script
2. Apply migrations to create auxiliary tables
3. Populate auxiliary tables from existing data
4. Verify data integrity

### Phase 3: Integration and cleanup
1. Update all callers to use extension services
2. Remove forge-specific code from upstream crates
3. Test composition layer functionality
4. Run regression verification

## 6. Testing Strategy

### Extension crate tests
- Unit tests for each service (migrate existing tests)
- Integration tests for database operations
- Smoke tests for API endpoints

### Migration validation
- Test migrations with real snapshot data
- Verify idempotent behavior
- Test rollback scenarios

### Composition layer tests
- Test service wiring and dependencies
- Verify upstream service integration
- Test route handlers and response formats

## 7. Rollback Plan

If issues arise:
1. Restore original upstream crate code from git
2. Drop auxiliary tables: `DROP TABLE forge_task_extensions, forge_project_settings, forge_omni_notifications`
3. Revert workspace Cargo.toml changes
4. Use backup snapshot data if needed

## 8. Success Criteria

- [ ] All extension crates compile and pass tests
- [ ] Auxiliary tables created with data migrated
- [ ] forge-app serves basic endpoints successfully
- [ ] No forge-specific code remains in upstream crates
- [ ] Regression tests pass with snapshot data
- [ ] Documentation updated with migration notes

## Dependencies

- forge-extensions/omni: reqwest, serde, ts-rs
- forge-extensions/branch-templates: sqlx, uuid, utils
- forge-extensions/config: serde, serde_json
- forge-app: axum, sqlx, all extension crates