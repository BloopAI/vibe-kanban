-- Add GitHub issue tracking fields to tasks table
ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER;
ALTER TABLE tasks ADD COLUMN github_issue_url TEXT;
ALTER TABLE tasks ADD COLUMN github_issue_state TEXT; -- 'open' or 'closed'
ALTER TABLE tasks ADD COLUMN github_issue_repo_id BLOB REFERENCES repos(id);
ALTER TABLE tasks ADD COLUMN github_issue_assignee TEXT; -- GitHub username
ALTER TABLE tasks ADD COLUMN github_issue_synced_at TEXT;

-- Index for efficient lookups by issue number + repo
CREATE INDEX idx_tasks_github_issue ON tasks(github_issue_repo_id, github_issue_number)
    WHERE github_issue_number IS NOT NULL;

-- Add GitHub issue sync settings to project_repos table
ALTER TABLE project_repos ADD COLUMN github_issue_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_repos ADD COLUMN github_issue_import_to_todo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_repos ADD COLUMN github_issue_create_from_tasks INTEGER NOT NULL DEFAULT 0;
