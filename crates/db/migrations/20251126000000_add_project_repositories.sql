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

-- Migrate existing projects to project_repositories FIRST
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

-- Backfill per-repo state for legacy single-repo projects
-- All legacy projects have exactly one repository, so we can use a simple join
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
JOIN project_repositories pr ON pr.project_id = t.project_id;

-- Drop legacy commit columns from execution_processes now that per-repo state exists
ALTER TABLE execution_processes DROP COLUMN before_head_commit;
ALTER TABLE execution_processes DROP COLUMN after_head_commit;

-- Drop legacy git_repo_path from projects now that repos are in project_repositories
-- SQLite cannot drop a UNIQUE column directly, so we need to recreate the table
PRAGMA foreign_keys = OFF;

CREATE TABLE projects_new (
    id                BLOB PRIMARY KEY,
    name              TEXT NOT NULL,
    setup_script      TEXT DEFAULT '',
    dev_script        TEXT,
    cleanup_script    TEXT,
    copy_files        TEXT,
    remote_project_id BLOB,
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

INSERT INTO projects_new (id, name, setup_script, dev_script, cleanup_script, copy_files, remote_project_id, created_at, updated_at)
SELECT id, name, setup_script, dev_script, cleanup_script, copy_files, remote_project_id, created_at, updated_at
FROM projects;

DROP TABLE projects;

ALTER TABLE projects_new RENAME TO projects;

-- Recreate the partial unique index on remote_project_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote_project_id
    ON projects(remote_project_id)
    WHERE remote_project_id IS NOT NULL;

PRAGMA foreign_keys = ON;
