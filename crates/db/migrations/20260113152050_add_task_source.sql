-- Add source field to track where tasks originated
-- Values: NULL (legacy/manual), 'manual', 'github', 'linear', 'jira', etc.
ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT NULL;

-- Add external reference for linking back to source
-- e.g., 'github:owner/repo#123' or 'linear:ISSUE-123'
ALTER TABLE tasks ADD COLUMN external_ref TEXT DEFAULT NULL;

-- Index for filtering by source
CREATE INDEX idx_tasks_source ON tasks(source) WHERE source IS NOT NULL;
