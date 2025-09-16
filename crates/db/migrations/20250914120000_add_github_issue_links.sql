PRAGMA foreign_keys = ON;

-- Links GitHub issues to tasks, preventing duplicate imports
CREATE TABLE IF NOT EXISTS github_issue_links (
  id             BLOB PRIMARY KEY,
  project_id     BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id        BLOB NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  issue_id       BIGINT NOT NULL,
  issue_number   INTEGER NOT NULL,
  repo_owner     TEXT NOT NULL,
  repo_name      TEXT NOT NULL,
  html_url       TEXT NOT NULL,
  title          TEXT NOT NULL,
  state          TEXT NOT NULL CHECK(state IN ('open','closed')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_synced_at TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_issue_links_issue_id
  ON github_issue_links(issue_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_issue_links_repo_number
  ON github_issue_links(project_id, repo_owner, repo_name, issue_number);

CREATE INDEX IF NOT EXISTS idx_github_issue_links_project_id 
  ON github_issue_links(project_id);

CREATE INDEX IF NOT EXISTS idx_github_issue_links_task_id 
  ON github_issue_links(task_id);

