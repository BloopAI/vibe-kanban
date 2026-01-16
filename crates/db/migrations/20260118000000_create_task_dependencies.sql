-- Task dependencies table for storing task-to-task dependency relationships
-- A dependency means task_id cannot be started until depends_on_task_id is completed

CREATE TABLE task_dependencies (
    id BLOB PRIMARY KEY,
    task_id BLOB NOT NULL,
    depends_on_task_id BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, depends_on_task_id),
    -- Prevent self-referential dependencies
    CHECK (task_id != depends_on_task_id)
);

-- Index for efficient lookup of dependencies for a task
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);

-- Index for efficient lookup of dependents (tasks that depend on a given task)
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
