PRAGMA foreign_keys = ON;

-- Remove stdout and stderr columns from task_attempts table
-- These are now tracked in the execution_processes table for better granularity

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- First, create a new table without stdout and stderr
CREATE TABLE task_attempts_new (
    id            BLOB PRIMARY KEY,
    task_id       BLOB NOT NULL,
    worktree_path TEXT NOT NULL,
    merge_commit  TEXT,
    executor      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Copy data from old table to new table (excluding stdout and stderr)
INSERT INTO task_attempts_new (id, task_id, worktree_path, merge_commit, executor, created_at, updated_at)
SELECT id, task_id, worktree_path, merge_commit, executor, created_at, updated_at
FROM task_attempts;

-- Drop the old table
DROP TABLE task_attempts;

-- Rename the new table to the original name
ALTER TABLE task_attempts_new RENAME TO task_attempts;
