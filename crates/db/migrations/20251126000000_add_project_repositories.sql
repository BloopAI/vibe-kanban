-- Normalized repos schema: repos as first-class shareable entities
-- with per-attempt target branches

-- Step 1: Create the global repos registry table
CREATE TABLE repos (
    id          BLOB PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,  -- filesystem path, globally unique
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Step 2: Create project_repos junction table
CREATE TABLE project_repos (
    id          BLOB PRIMARY KEY,
    project_id  BLOB NOT NULL,
    repo_id     BLOB NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (project_id, repo_id)
);

CREATE INDEX idx_project_repos_project_id ON project_repos(project_id);
CREATE INDEX idx_project_repos_repo_id ON project_repos(repo_id);

-- Step 3: Create attempt_repos table for per-attempt target branches
CREATE TABLE attempt_repos (
    id              BLOB PRIMARY KEY,
    attempt_id      BLOB NOT NULL,
    repo_id         BLOB NOT NULL,
    target_branch   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (attempt_id, repo_id)
);

CREATE INDEX idx_attempt_repos_attempt_id ON attempt_repos(attempt_id);
CREATE INDEX idx_attempt_repos_repo_id ON attempt_repos(repo_id);

-- Step 4: Per-repo execution process state (before/after/merge commits)
CREATE TABLE execution_process_repo_states (
    id                      BLOB PRIMARY KEY,
    execution_process_id    BLOB NOT NULL,
    repo_id                 BLOB NOT NULL,
    before_head_commit      TEXT,
    after_head_commit       TEXT,
    merge_commit            TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (execution_process_id, repo_id)
);

CREATE INDEX idx_execution_process_repo_states_process_id
    ON execution_process_repo_states(execution_process_id);
CREATE INDEX idx_execution_process_repo_states_repo_id
    ON execution_process_repo_states(repo_id);

-- Step 5: Migrate existing projects to repos + project_repos
-- Extract directory name from git_repo_path using recursive CTE to find last path component
WITH RECURSIVE
  paths AS (
    SELECT
      id as project_id,
      git_repo_path,
      RTRIM(git_repo_path, '/') as trimmed_path
    FROM projects
    WHERE git_repo_path IS NOT NULL AND git_repo_path != ''
  ),
  extract_name(project_id, git_repo_path, remaining, name) AS (
    SELECT project_id, git_repo_path, trimmed_path, trimmed_path FROM paths
    UNION ALL
    SELECT
      project_id,
      git_repo_path,
      SUBSTR(remaining, INSTR(remaining, '/') + 1),
      SUBSTR(remaining, INSTR(remaining, '/') + 1)
    FROM extract_name
    WHERE INSTR(remaining, '/') > 0
  )
INSERT INTO repos (id, path, name)
SELECT
    lower(hex(randomblob(16))),
    git_repo_path,
    name
FROM extract_name
WHERE INSTR(remaining, '/') = 0;

-- Link projects to repos via project_repos junction
INSERT INTO project_repos (id, project_id, repo_id)
SELECT
    lower(hex(randomblob(16))),
    p.id,
    r.id
FROM projects p
JOIN repos r ON r.path = p.git_repo_path
WHERE p.git_repo_path IS NOT NULL AND p.git_repo_path != '';

-- Step 6: Migrate existing task_attempt.target_branch to attempt_repos
-- For each task_attempt, create an entry for each repo in the project
INSERT INTO attempt_repos (id, attempt_id, repo_id, target_branch, created_at, updated_at)
SELECT
    lower(hex(randomblob(16))),
    ta.id,
    r.id,
    ta.target_branch,
    ta.created_at,
    ta.updated_at
FROM task_attempts ta
JOIN tasks t ON t.id = ta.task_id
JOIN project_repos pr ON pr.project_id = t.project_id
JOIN repos r ON r.id = pr.repo_id;

-- Step 7: Backfill per-repo state for legacy single-repo projects
INSERT INTO execution_process_repo_states (
    id,
    execution_process_id,
    repo_id,
    before_head_commit,
    after_head_commit
)
SELECT
    lower(hex(randomblob(16))),
    ep.id,
    r.id,
    ep.before_head_commit,
    ep.after_head_commit
FROM execution_processes ep
JOIN task_attempts ta ON ta.id = ep.task_attempt_id
JOIN tasks t ON t.id = ta.task_id
JOIN project_repos pr ON pr.project_id = t.project_id
JOIN repos r ON r.id = pr.repo_id;

-- Step 8: Drop legacy commit columns from execution_processes
ALTER TABLE execution_processes DROP COLUMN before_head_commit;
ALTER TABLE execution_processes DROP COLUMN after_head_commit;

-- Step 9: Recreate task_attempts without target_branch column
PRAGMA foreign_keys = OFF;

CREATE TABLE task_attempts_new (
    id                  BLOB PRIMARY KEY,
    task_id             BLOB NOT NULL,
    container_ref       TEXT,
    branch              TEXT NOT NULL,
    executor            TEXT NOT NULL,
    worktree_deleted    INTEGER NOT NULL DEFAULT 0,
    setup_completed_at  TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

INSERT INTO task_attempts_new (
    id, task_id, container_ref, branch, executor, worktree_deleted, setup_completed_at, created_at, updated_at
)
SELECT
    id, task_id, container_ref, branch, executor, worktree_deleted, setup_completed_at, created_at, updated_at
FROM task_attempts;

DROP TABLE task_attempts;
ALTER TABLE task_attempts_new RENAME TO task_attempts;

CREATE INDEX idx_task_attempts_task_id ON task_attempts(task_id);
CREATE INDEX idx_task_attempts_container_ref ON task_attempts(container_ref);

-- Step 10: Recreate projects without git_repo_path column
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
