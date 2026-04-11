CREATE TABLE pull_requests (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id BLOB,
    repo_id BLOB,
    pr_url TEXT NOT NULL UNIQUE,
    pr_number INTEGER NOT NULL,
    pr_status TEXT NOT NULL DEFAULT 'open',
    target_branch_name TEXT NOT NULL,
    merged_at TEXT,
    merge_commit_sha TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME
);

-- Migrate workspace PR data from merges into pull_requests
INSERT OR IGNORE INTO pull_requests (id, workspace_id, repo_id, pr_url, pr_number, pr_status, target_branch_name, merged_at, merge_commit_sha, created_at, updated_at, synced_at)
SELECT hex(id), workspace_id, repo_id, pr_url, pr_number, COALESCE(pr_status, 'open'), target_branch_name, pr_merged_at, pr_merge_commit_sha, created_at, created_at, created_at
FROM merges WHERE merge_type = 'pr' AND pr_url IS NOT NULL;

-- Remove PR rows from merges (now in pull_requests)
DELETE FROM merges WHERE merge_type = 'pr';

CREATE INDEX idx_pull_requests_status ON pull_requests(pr_status);
CREATE INDEX idx_pull_requests_workspace_id ON pull_requests(workspace_id);

PRAGMA optimize;
