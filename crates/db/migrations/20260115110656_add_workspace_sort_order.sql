-- Add sort_order column (REAL for fractional indexing)
ALTER TABLE workspaces ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;

-- Initialize existing workspaces: newest = lowest sort_order (appears first)
-- Use negative values so new workspaces (default 0) appear at top
UPDATE workspaces
SET sort_order = -(
    SELECT COUNT(*)
    FROM workspaces AS w2
    WHERE w2.created_at < workspaces.created_at
);
