-- Add project_repositories table to support multiple repositories per project

CREATE TABLE project_repositories (
    id                    BLOB PRIMARY KEY,
    project_id            BLOB NOT NULL,
    name                  TEXT NOT NULL,           
    git_repo_path         TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (project_id, name),
    UNIQUE (project_id, git_repo_path)
);

CREATE INDEX idx_project_repositories_project_id ON project_repositories(project_id);

-- Per-repo execution process state (before/after/merge commits)
CREATE TABLE execution_process_repo_states (
    id                      BLOB PRIMARY KEY,
    execution_process_id    BLOB NOT NULL,
    project_repository_id   BLOB NOT NULL,
    before_head_commit      TEXT,
    after_head_commit       TEXT,
    merge_commit            TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (project_repository_id) REFERENCES project_repositories(id) ON DELETE CASCADE,
    UNIQUE (execution_process_id, project_repository_id)
);

CREATE INDEX idx_execution_process_repo_states_process_id
    ON execution_process_repo_states(execution_process_id);

-- Backfill per-repo state for legacy single-repo projects only (best-effort)
INSERT INTO execution_process_repo_states (
    id,
    execution_process_id,
    project_repository_id,
    before_head_commit,
    after_head_commit
)
SELECT
    lower(hex(randomblob(16))),
    ep.id,
    pr.id,
    ep.before_head_commit,
    ep.after_head_commit
FROM execution_processes ep
JOIN task_attempts ta ON ta.id = ep.task_attempt_id
JOIN tasks t ON t.id = ta.task_id
JOIN projects p ON p.id = t.project_id
JOIN (
    -- Only projects with exactly one repository; otherwise we lack per-repo commit data
    SELECT project_id, MIN(id) AS id
    FROM project_repositories
    GROUP BY project_id
    HAVING COUNT(1) = 1
) pr ON pr.project_id = p.id;

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

-- Drop legacy commit columns from execution_processes now that per-repo state exists
ALTER TABLE execution_processes DROP COLUMN before_head_commit;
ALTER TABLE execution_processes DROP COLUMN after_head_commit;
