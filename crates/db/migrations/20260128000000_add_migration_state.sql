-- Migration state tracking table for local→remote data migration
CREATE TABLE IF NOT EXISTS migration_state (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,  -- 'project', 'task', 'pr_merge'
    local_id TEXT NOT NULL,
    remote_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'migrated', 'failed', 'skipped'
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(entity_type, local_id)
);

CREATE INDEX idx_migration_state_status ON migration_state(status);
CREATE INDEX idx_migration_state_entity_type ON migration_state(entity_type);
CREATE INDEX idx_migration_state_entity_lookup ON migration_state(entity_type, local_id);
