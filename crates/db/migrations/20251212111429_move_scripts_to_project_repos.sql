-- Migration: Move script fields from projects to project_repos
-- This enables per-repository script configuration in multi-repo projects

-- Step 1: Add script columns to project_repos
ALTER TABLE project_repos ADD COLUMN setup_script TEXT;
ALTER TABLE project_repos ADD COLUMN dev_script TEXT;
ALTER TABLE project_repos ADD COLUMN cleanup_script TEXT;
ALTER TABLE project_repos ADD COLUMN copy_files TEXT;
ALTER TABLE project_repos ADD COLUMN parallel_setup_script INTEGER NOT NULL DEFAULT 0;

-- Step 2: Migrate scripts from projects to the first repo (alphabetically by display_name) for each project
-- This preserves existing scripts for projects that already have repositories
UPDATE project_repos
SET
    setup_script = (SELECT setup_script FROM projects WHERE id = project_repos.project_id),
    dev_script = (SELECT dev_script FROM projects WHERE id = project_repos.project_id),
    cleanup_script = (SELECT cleanup_script FROM projects WHERE id = project_repos.project_id),
    copy_files = (SELECT copy_files FROM projects WHERE id = project_repos.project_id),
    parallel_setup_script = (SELECT parallel_setup_script FROM projects WHERE id = project_repos.project_id)
WHERE project_repos.id IN (
    SELECT pr.id
    FROM project_repos pr
    JOIN repos r ON r.id = pr.repo_id
    GROUP BY pr.project_id
    HAVING pr.id = (
        SELECT pr2.id
        FROM project_repos pr2
        JOIN repos r2 ON r2.id = pr2.repo_id
        WHERE pr2.project_id = pr.project_id
        ORDER BY r2.display_name ASC
        LIMIT 1
    )
);

-- Step 3: Recreate projects table without script columns (SQLite pattern)
COMMIT;

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Create replacement table without script columns
CREATE TABLE projects_new (
    id                BLOB PRIMARY KEY,
    name              TEXT NOT NULL,
    remote_project_id BLOB,
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

INSERT INTO projects_new (id, name, remote_project_id, created_at, updated_at)
SELECT id, name, remote_project_id, created_at, updated_at
FROM projects;

-- Drop the original table
DROP TABLE projects;

-- Rename the new table into place
ALTER TABLE projects_new RENAME TO projects;

-- Rebuild indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote_project_id
    ON projects(remote_project_id)
    WHERE remote_project_id IS NOT NULL;

-- Verify foreign key constraints
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- sqlx workaround for transaction handling
BEGIN TRANSACTION;
