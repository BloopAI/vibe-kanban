-- Project-level settings for GitHub Issues sync
ALTER TABLE projects
  ADD COLUMN github_issues_sync_enabled BOOLEAN NOT NULL DEFAULT 0
    CHECK (github_issues_sync_enabled IN (0,1));

ALTER TABLE projects
  ADD COLUMN github_issues_create_on_new_tasks BOOLEAN NOT NULL DEFAULT 0
    CHECK (github_issues_create_on_new_tasks IN (0,1));

ALTER TABLE projects
  ADD COLUMN github_issues_last_sync_at TEXT NULL;

