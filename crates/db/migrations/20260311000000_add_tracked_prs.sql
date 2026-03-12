CREATE TABLE tracked_prs (
    id TEXT PRIMARY KEY NOT NULL,
    remote_issue_id TEXT,
    workspace_id BLOB,
    repo_id BLOB,
    pr_url TEXT NOT NULL UNIQUE,
    pr_number INTEGER NOT NULL,
    pr_status TEXT NOT NULL DEFAULT 'open',
    target_branch_name TEXT NOT NULL,
    merged_at TEXT,
    merge_commit_sha TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migrate workspace PR data from merges into tracked_prs
INSERT OR IGNORE INTO tracked_prs (id, workspace_id, repo_id, pr_url, pr_number, pr_status, target_branch_name, merged_at, merge_commit_sha, created_at)
SELECT hex(id), workspace_id, repo_id, pr_url, pr_number, COALESCE(pr_status, 'open'), target_branch_name, pr_merged_at, pr_merge_commit_sha, created_at
FROM merges WHERE merge_type = 'pr' AND pr_url IS NOT NULL;

-- Remove PR rows from merges (now in tracked_prs)
DELETE FROM merges WHERE merge_type = 'pr';

CREATE INDEX idx_tracked_prs_status ON tracked_prs(pr_status);
CREATE INDEX idx_tracked_prs_workspace_id ON tracked_prs(workspace_id);

PRAGMA optimize;
