-- Add explicit index on workspaces(id) to fix slow queries
-- SQLite does not automatically index BLOB PRIMARY KEYs, unlike INTEGER PRIMARY KEY
-- This was causing 20+ second queries on lookups by workspace UUID

CREATE INDEX IF NOT EXISTS idx_workspaces_id ON workspaces(id);

-- Also add index on scratch composite primary key for optimal performance
-- Although composite PRIMARY KEY creates an index, an explicit one ensures optimal query plans
CREATE INDEX IF NOT EXISTS idx_scratch_id_type ON scratch(id, scratch_type);

-- Optimize database for the new indexes
PRAGMA optimize;
