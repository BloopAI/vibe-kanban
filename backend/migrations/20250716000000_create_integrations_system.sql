-- Create integrations system
-- This migration adds support for a comprehensive integrations page

-- Integration categories lookup table
CREATE TABLE integration_categories (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Main integrations table
CREATE TABLE integrations (
    id BLOB PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'ai_assistant', 'version_control', 'communication', 'project_management', 'development_tool'
    provider TEXT NOT NULL, -- 'github', 'slack', 'claude', 'jira', etc.
    category_id TEXT NOT NULL,
    config TEXT, -- JSON configuration specific to integration
    enabled BOOLEAN DEFAULT false,
    health_status TEXT DEFAULT 'unknown', -- 'healthy', 'error', 'warning', 'unknown'
    last_sync_at TEXT,
    last_health_check_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (category_id) REFERENCES integration_categories(id) ON DELETE CASCADE
);

-- Integration events/audit log
CREATE TABLE integration_events (
    id BLOB PRIMARY KEY,
    integration_id BLOB NOT NULL,
    event_type TEXT NOT NULL, -- 'created', 'updated', 'enabled', 'disabled', 'sync', 'test', 'error'
    event_data TEXT, -- JSON data about the event
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_integrations_type ON integrations(type);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_category ON integrations(category_id);
CREATE INDEX idx_integrations_enabled ON integrations(enabled);
CREATE INDEX idx_integrations_health ON integrations(health_status);
CREATE INDEX idx_integration_events_integration_id ON integration_events(integration_id);
CREATE INDEX idx_integration_events_type ON integration_events(event_type);
CREATE INDEX idx_integration_events_created_at ON integration_events(created_at);

-- Insert default categories
INSERT INTO integration_categories (id, display_name, description, icon, sort_order) VALUES
('ai_assistant', 'AI Assistants', 'AI-powered coding assistants and language models', 'brain', 1),
('version_control', 'Version Control', 'Git hosting and version control platforms', 'git-branch', 2),
('communication', 'Communication', 'Team messaging and notification platforms', 'message-circle', 3),
('project_management', 'Project Management', 'Task tracking and project management tools', 'kanban-square', 4),
('development_tool', 'Development Tools', 'IDEs, editors, and development utilities', 'code', 5);

-- Migrate existing MCP servers to integrations
-- This will be populated by a data migration script