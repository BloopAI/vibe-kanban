-- Add composite index for workspace_repos lookup queries
-- This optimizes queries like: WHERE workspace_id = $1 AND repo_id = $2
-- which were taking up to 5 seconds without this index
CREATE INDEX IF NOT EXISTS idx_workspace_repos_lookup 
ON workspace_repos (workspace_id, repo_id);

-- Add composite index for merges status filtering
-- This optimizes queries like: WHERE merge_type = 'pr' AND pr_status = 'open'
-- which were taking 2+ seconds without proper indexing
CREATE INDEX IF NOT EXISTS idx_merges_type_status 
ON merges (merge_type, pr_status);

-- Optimize database after adding indexes
PRAGMA optimize;
