-- Task Approvals: Track which users have approved a task.
-- Used as a gating function for lifecycle transitions (e.g., inreview -> done).

CREATE TABLE task_approvals (
    id BLOB PRIMARY KEY NOT NULL,
    task_id BLOB NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(task_id, user_id)
);

CREATE INDEX idx_task_approvals_task_id ON task_approvals(task_id);
CREATE INDEX idx_task_approvals_user_id ON task_approvals(user_id);

ALTER TABLE projects ADD COLUMN min_approvals_required INTEGER NOT NULL DEFAULT 1;
