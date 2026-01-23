-- Add 'ci' and 'cd' to the allowed task statuses in the tasks table.
-- These statuses represent Continuous Integration and Continuous Delivery stages,
-- positioned after 'inreview' and before 'done' in the workflow.

-- Recreate the tasks table with updated CHECK constraint
CREATE TABLE tasks_new (
    id                   BLOB PRIMARY KEY,
    project_id           BLOB NOT NULL,
    title                TEXT NOT NULL,
    description          TEXT,
    status               TEXT NOT NULL DEFAULT 'todo'
                            CHECK (status IN ('todo','inprogress','inreview','ci','cd','done','cancelled')),
    parent_workspace_id  BLOB,
    shared_task_id       BLOB,
    creator_user_id      BLOB,
    assignee_user_id     BLOB,
    created_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO tasks_new (id, project_id, title, description, status, parent_workspace_id, shared_task_id, creator_user_id, assignee_user_id, created_at, updated_at)
    SELECT id, project_id, title, description, status, parent_workspace_id, shared_task_id, creator_user_id, assignee_user_id, created_at, updated_at FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate indexes that existed on the original table
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_shared_task_unique
    ON tasks(shared_task_id)
    WHERE shared_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_creator_user_id ON tasks(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user_id ON tasks(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
