PRAGMA foreign_keys = ON;

-- Cache of nodes from the hive/remote server
-- These are synced periodically from the hive to provide a unified view
-- of all nodes and their projects across the organization.
CREATE TABLE IF NOT EXISTS cached_nodes (
    id                  BLOB PRIMARY KEY,
    organization_id     BLOB NOT NULL,
    name                TEXT NOT NULL,
    machine_id          TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','online','offline','busy','draining')),
    capabilities        TEXT NOT NULL DEFAULT '{}',  -- JSON serialized NodeCapabilities
    public_url          TEXT,
    last_heartbeat_at   TEXT,
    connected_at        TEXT,
    disconnected_at     TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    -- Sync metadata
    last_synced_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX IF NOT EXISTS idx_cached_nodes_organization
    ON cached_nodes (organization_id);

CREATE INDEX IF NOT EXISTS idx_cached_nodes_status
    ON cached_nodes (status);

-- Cache of node-project links from the hive/remote server
-- Maps which projects exist on which nodes.
CREATE TABLE IF NOT EXISTS cached_node_projects (
    id                  BLOB PRIMARY KEY,
    node_id             BLOB NOT NULL REFERENCES cached_nodes(id) ON DELETE CASCADE,
    project_id          BLOB NOT NULL,      -- Remote project ID (in hive)
    local_project_id    BLOB NOT NULL,      -- Local project ID on the node
    project_name        TEXT NOT NULL,
    git_repo_path       TEXT NOT NULL,
    default_branch      TEXT NOT NULL DEFAULT 'main',
    sync_status         TEXT NOT NULL DEFAULT 'pending',
    last_synced_at      TEXT,
    created_at          TEXT NOT NULL,
    -- Sync metadata
    cached_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX IF NOT EXISTS idx_cached_node_projects_node
    ON cached_node_projects (node_id);

CREATE INDEX IF NOT EXISTS idx_cached_node_projects_project
    ON cached_node_projects (project_id);

-- Cursor for tracking node sync state per organization
CREATE TABLE IF NOT EXISTS node_sync_cursors (
    organization_id     BLOB PRIMARY KEY,
    last_synced_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    sync_version        INTEGER NOT NULL DEFAULT 1
);
