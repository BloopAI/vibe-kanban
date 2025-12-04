-- Step 1: Create global repos registry
CREATE TABLE repos (
    id          BLOB PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Step 2: Create project_repos junction
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

-- Step 3: Create attempt_repos
CREATE TABLE attempt_repos (
    id            BLOB PRIMARY KEY,
    attempt_id    BLOB NOT NULL,
    repo_id       BLOB NOT NULL,
    target_branch TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (attempt_id, repo_id)
);
CREATE INDEX idx_attempt_repos_attempt_id ON attempt_repos(attempt_id);
CREATE INDEX idx_attempt_repos_repo_id ON attempt_repos(repo_id);

-- Step 4: Execution process repo states
CREATE TABLE execution_process_repo_states (
    id                   BLOB PRIMARY KEY,
    execution_process_id BLOB NOT NULL,
    repo_id              BLOB NOT NULL,
    before_head_commit   TEXT,
    after_head_commit    TEXT,
    merge_commit         TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (execution_process_id, repo_id)
);
CREATE INDEX idx_eprs_process_id ON execution_process_repo_states(execution_process_id);
CREATE INDEX idx_eprs_repo_id ON execution_process_repo_states(repo_id);

-- Step 5: Migrate existing projects to repos
INSERT INTO repos (id, path, name)
SELECT
    randomblob(16),
    git_repo_path,
    -- Simulates `basename`: converts "a/b/c" -> ["a","b","c"] -> gets "c"
    json_extract('["' || replace(RTRIM(git_repo_path, '/'), '/', '","') || '"]', '$[#-1]')
FROM projects
WHERE git_repo_path IS NOT NULL AND git_repo_path != '';

INSERT INTO project_repos (id, project_id, repo_id)
SELECT
    randomblob(16),
    p.id,
    r.id
FROM projects p
JOIN repos r ON r.path = p.git_repo_path
WHERE p.git_repo_path IS NOT NULL AND p.git_repo_path != '';

-- Step 6: Migrate task_attempt.target_branch
INSERT INTO attempt_repos (id, attempt_id, repo_id, target_branch, created_at, updated_at)
SELECT
    randomblob(16),
    ta.id,
    r.id,
    ta.target_branch,
    ta.created_at,
    ta.updated_at
FROM task_attempts ta
JOIN tasks t ON t.id = ta.task_id
JOIN project_repos pr ON pr.project_id = t.project_id
JOIN repos r ON r.id = pr.repo_id;

-- Step 7: Backfill per-repo state
INSERT INTO execution_process_repo_states (
    id, execution_process_id, repo_id, before_head_commit, after_head_commit
)
SELECT
    randomblob(16),
    ep.id,
    r.id,
    ep.before_head_commit,
    ep.after_head_commit
FROM execution_processes ep
JOIN task_attempts ta ON ta.id = ep.task_attempt_id
JOIN tasks t ON t.id = ta.task_id
JOIN project_repos pr ON pr.project_id = t.project_id
JOIN repos r ON r.id = pr.repo_id;

-- Step 8: Cleanup old columns (Modern SQLite Syntax)
-- Note: Old worktrees are migrated on-demand via WorkspaceManager::migrate_legacy_worktree
-- using `git worktree move` to preserve existing work
ALTER TABLE execution_processes DROP COLUMN before_head_commit;
ALTER TABLE execution_processes DROP COLUMN after_head_commit;

ALTER TABLE task_attempts DROP COLUMN target_branch;

-- Step 9: Recreate projects table to remove `git_repo_path` (which has a UNIQUE constraint)

COMMIT;

PRAGMA foreign_keys = OFF;

-- This is a sqlx workaround to enable BEGIN TRANSACTION in this migration
-- This commits Steps 1-8 immediately.

BEGIN TRANSACTION;

-- Create replacement table
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

-- Copy existing data into the replacement table
INSERT INTO projects_new (
    id, name, setup_script, dev_script, cleanup_script, copy_files, 
    remote_project_id, created_at, updated_at
)
SELECT 
    id, name, setup_script, dev_script, cleanup_script, copy_files, 
    remote_project_id, created_at, updated_at
FROM projects;

-- Drop the original table
DROP TABLE projects;

-- Rename the new table into place
ALTER TABLE projects_new RENAME TO projects;

-- Rebuild indexes to preserve performance/constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote_project_id
    ON projects(remote_project_id)
    WHERE remote_project_id IS NOT NULL;

-- Verify foreign key constraints before committing the transaction
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- sqlx workaround due to lack of `-- no-transaction` in sqlx-sqlite.
-- Starts a new empty transaction for sqlx to close successfully.
BEGIN TRANSACTION;
