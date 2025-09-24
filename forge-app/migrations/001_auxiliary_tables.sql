-- Forge Extension Auxiliary Tables
-- Task 2: Backend feature extraction migration
--
-- Creates auxiliary tables for forge-specific features without modifying upstream schema
-- These tables use foreign keys to reference upstream tables but remain completely separate

-- Extensions for individual tasks
CREATE TABLE IF NOT EXISTS forge_task_extensions (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings TEXT, -- JSON for Omni notification settings
    genie_metadata TEXT, -- JSON for future Genie integration
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Project-level settings and configuration
CREATE TABLE IF NOT EXISTS forge_project_settings (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors TEXT, -- JSON for custom executor configurations
    forge_config TEXT, -- JSON for forge-specific project settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Omni notification history and tracking
CREATE TABLE IF NOT EXISTS forge_omni_notifications (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL,
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at DATETIME,
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Convenience view for enhanced task access with forge extensions
CREATE VIEW IF NOT EXISTS enhanced_tasks AS
SELECT
    t.*,
    fx.branch_template,
    fx.omni_settings,
    fx.genie_metadata
FROM tasks t
LEFT JOIN forge_task_extensions fx ON t.id = fx.task_id;

-- Convenience view for enhanced projects with forge settings
CREATE VIEW IF NOT EXISTS enhanced_projects AS
SELECT
    p.*,
    fps.custom_executors,
    fps.forge_config
FROM projects p
LEFT JOIN forge_project_settings fps ON p.id = fps.project_id;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_forge_task_extensions_task_id ON forge_task_extensions(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_project_settings_project_id ON forge_project_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_forge_omni_notifications_task_id ON forge_omni_notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_omni_notifications_status ON forge_omni_notifications(status);
CREATE INDEX IF NOT EXISTS idx_forge_omni_notifications_sent_at ON forge_omni_notifications(sent_at);

-- Triggers to maintain updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_forge_task_extensions_updated_at
AFTER UPDATE ON forge_task_extensions
BEGIN
    UPDATE forge_task_extensions SET updated_at = CURRENT_TIMESTAMP WHERE task_id = NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS update_forge_project_settings_updated_at
AFTER UPDATE ON forge_project_settings
BEGIN
    UPDATE forge_project_settings SET updated_at = CURRENT_TIMESTAMP WHERE project_id = NEW.project_id;
END;