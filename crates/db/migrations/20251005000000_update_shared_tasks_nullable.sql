--
-- Migration steps following the official SQLite "12-step generalized ALTER TABLE" procedure:
-- https://www.sqlite.org/lang_altertable.html#otheralter
--
PRAGMA foreign_keys = OFF;

-- This is a sqlx workaround to enable BEGIN TRANSACTION in this migration, until `-- no-transaction` lands in sqlx-sqlite.
-- https://github.com/launchbadge/sqlx/issues/2085#issuecomment-1499859906
COMMIT TRANSACTION;

BEGIN TRANSACTION;

-- Create replacement table.
CREATE TABLE shared_tasks_new (
    id                 BLOB PRIMARY KEY,
    organization_id    TEXT NOT NULL,
    project_id         BLOB,     -- Dropped NOT NULL
    github_repo_id     INTEGER,  -- Added
    title              TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    assignee_user_id   TEXT,
    assignee_first_name TEXT,
    assignee_last_name  TEXT,
    assignee_username   TEXT,
    version            INTEGER NOT NULL DEFAULT 1,
    last_event_seq     INTEGER,
    created_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL  -- Changed `ON DELETE` to `SET NULL`
);

-- Copy data into the new table, initializing github_repo_id.
INSERT INTO shared_tasks_new (
    id,
    organization_id,
    project_id,
    github_repo_id,
    title,
    description,
    status,
    assignee_user_id,
    assignee_first_name,
    assignee_last_name,
    assignee_username,
    version,
    last_event_seq,
    created_at,
    updated_at
)
SELECT
    id,
    organization_id,
    project_id,
    NULL,
    title,
    description,
    status,
    assignee_user_id,
    assignee_first_name,
    assignee_last_name,
    assignee_username,
    version,
    last_event_seq,
    created_at,
    updated_at
FROM shared_tasks;

-- Drop the original table.
DROP TABLE shared_tasks;

-- Rename the new table into place.
ALTER TABLE shared_tasks_new RENAME TO shared_tasks;

-- Rebuild indexes.
CREATE INDEX IF NOT EXISTS idx_shared_tasks_org
    ON shared_tasks (organization_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_status
    ON shared_tasks (status);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_project
    ON shared_tasks (project_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_github_repo
    ON shared_tasks (github_repo_id);

-- Verify constraints before committing the transaction.
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- sqlx workound due to lack of `-- no-transaction` in sqlx-sqlite.
BEGIN TRANSACTION;
