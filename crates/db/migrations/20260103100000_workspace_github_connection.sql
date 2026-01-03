-- Migration: Move GitHub connections from team-level to workspace-level
-- A workspace-level connection has team_id = NULL

-- Step 1: Create new table with nullable team_id
CREATE TABLE github_connections_new (
    id              BLOB PRIMARY KEY,
    team_id         BLOB,  -- NULL for workspace-level connection
    access_token    TEXT NOT NULL,
    github_username TEXT,
    connected_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Step 2: Copy existing connections (will be migrated to workspace level)
INSERT INTO github_connections_new (id, team_id, access_token, github_username, connected_at, updated_at)
SELECT id, NULL, access_token, github_username, connected_at, updated_at
FROM github_connections
LIMIT 1;  -- Only take one connection to be the workspace connection

-- Step 3: Drop old table and rename new one
DROP TABLE github_connections;
ALTER TABLE github_connections_new RENAME TO github_connections;

-- Step 4: Recreate indexes
CREATE INDEX idx_github_connections_team_id ON github_connections(team_id);

-- Step 5: Add unique constraint for workspace-level connection (only one NULL team_id)
-- SQLite doesn't enforce unique on NULL, so we use a partial index
CREATE UNIQUE INDEX idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;
