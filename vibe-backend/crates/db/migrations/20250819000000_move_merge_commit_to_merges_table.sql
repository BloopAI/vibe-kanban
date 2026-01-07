-- Create enhanced merges table with type-specific columns
CREATE TABLE merges (
    id              BLOB PRIMARY KEY,
    task_attempt_id BLOB NOT NULL,
    merge_type      TEXT NOT NULL CHECK (merge_type IN ('direct', 'pr')),
    
    -- Direct merge fields (NULL for PR merges)
    merge_commit    TEXT,
    
    -- PR merge fields (NULL for direct merges)
    pr_number       INTEGER,
    pr_url          TEXT,
    pr_status       TEXT CHECK (pr_status IN ('open', 'merged', 'closed')),
    pr_merged_at    TEXT,
    pr_merge_commit_sha TEXT,
    
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    target_branch_name TEXT NOT NULL,

    -- Data integrity constraints
    CHECK (
        (merge_type = 'direct' AND merge_commit IS NOT NULL 
         AND pr_number IS NULL AND pr_url IS NULL) 
        OR 
        (merge_type = 'pr' AND pr_number IS NOT NULL AND pr_url IS NOT NULL 
         AND pr_status IS NOT NULL AND merge_commit IS NULL)
    ),
    
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

-- Create general index for all task_attempt_id queries
CREATE INDEX idx_merges_task_attempt_id ON merges(task_attempt_id);

-- Create index for finding open PRs quickly
CREATE INDEX idx_merges_open_pr ON merges(task_attempt_id, pr_status) 
WHERE merge_type = 'pr' AND pr_status = 'open';

-- Migrate existing merge_commit data to new table as direct merges
INSERT INTO merges (id, task_attempt_id, merge_type, merge_commit, created_at, target_branch_name)
SELECT 
    randomblob(16),
    id,
    'direct',
    merge_commit,
    updated_at,
    base_branch
FROM task_attempts
WHERE merge_commit IS NOT NULL;

-- Migrate existing PR data from task_attempts to merges
INSERT INTO merges (id, task_attempt_id, merge_type, pr_number, pr_url, pr_status, pr_merged_at, pr_merge_commit_sha, created_at, target_branch_name)
SELECT 
    randomblob(16),
    id,
    'pr',
    pr_number,
    pr_url,
    CASE 
        WHEN pr_status = 'merged' THEN 'merged'
        WHEN pr_status = 'closed' THEN 'closed'
        ELSE 'open'
    END,
    pr_merged_at,
    NULL, -- We don't have merge_commit for PRs in task_attempts
    COALESCE(pr_merged_at, updated_at),
    base_branch
FROM task_attempts
WHERE pr_number IS NOT NULL;

-- Drop merge_commit column from task_attempts
ALTER TABLE task_attempts DROP COLUMN merge_commit;

-- Drop PR columns from task_attempts
ALTER TABLE task_attempts DROP COLUMN pr_url;
ALTER TABLE task_attempts DROP COLUMN pr_number;
ALTER TABLE task_attempts DROP COLUMN pr_status;
ALTER TABLE task_attempts DROP COLUMN pr_merged_at;