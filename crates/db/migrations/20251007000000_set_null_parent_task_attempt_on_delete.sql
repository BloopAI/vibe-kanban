PRAGMA foreign_keys = OFF;

-- Create new tasks table with updated foreign key constraint
CREATE TABLE tasks_new (
    id          BLOB PRIMARY KEY,
    project_id  BLOB NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    parent_task_attempt BLOB,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_task_attempt) REFERENCES task_attempts(id) ON DELETE SET NULL
);

-- Copy data from old table to new table
INSERT INTO tasks_new (id, project_id, title, description, status, parent_task_attempt, created_at, updated_at)
SELECT id, project_id, title, description, status, parent_task_attempt, created_at, updated_at
FROM tasks;

-- Drop old table
DROP TABLE tasks;

-- Rename new table to original name
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate index for parent_task_attempt lookups
CREATE INDEX idx_tasks_parent_task_attempt ON tasks(parent_task_attempt);

PRAGMA foreign_keys = ON;
