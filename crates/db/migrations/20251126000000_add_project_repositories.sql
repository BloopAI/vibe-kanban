-- Add project_repositories table to support multiple repositories per project

CREATE TABLE project_repositories (
    id            BLOB PRIMARY KEY,
    project_id    BLOB NOT NULL,
    name          TEXT NOT NULL,           -- Directory name in worktree
    git_repo_path TEXT NOT NULL,           -- Absolute path to git repository
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (project_id, name),
    UNIQUE (project_id, git_repo_path)
);

CREATE INDEX idx_project_repositories_project_id ON project_repositories(project_id);

-- Migrate existing projects to project_repositories
-- Extract directory name from git_repo_path using recursive CTE to find last path component
WITH RECURSIVE
  paths AS (
    SELECT
      id,
      git_repo_path,
      RTRIM(git_repo_path, '/') as trimmed_path
    FROM projects
    WHERE git_repo_path IS NOT NULL AND git_repo_path != ''
  ),
  -- Recursively strip leading path components until we have just the name
  extract_name(id, git_repo_path, remaining, name) AS (
    SELECT id, git_repo_path, trimmed_path, trimmed_path FROM paths
    UNION ALL
    SELECT
      id,
      git_repo_path,
      SUBSTR(remaining, INSTR(remaining, '/') + 1),
      SUBSTR(remaining, INSTR(remaining, '/') + 1)
    FROM extract_name
    WHERE INSTR(remaining, '/') > 0
  )
INSERT INTO project_repositories (id, project_id, name, git_repo_path)
SELECT
    lower(hex(randomblob(16))),
    id,
    name,
    git_repo_path
FROM extract_name
WHERE INSTR(remaining, '/') = 0;
