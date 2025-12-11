PRAGMA foreign_keys = ON;

CREATE TABLE plan_steps (
    id                  BLOB PRIMARY KEY,
    parent_attempt_id   BLOB NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
    sequence_order      INTEGER NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'failed', 'skipped')),
    child_task_id       BLOB REFERENCES tasks(id) ON DELETE SET NULL,
    auto_start          INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_plan_steps_parent_attempt ON plan_steps(parent_attempt_id);
CREATE INDEX idx_plan_steps_status ON plan_steps(status);
CREATE INDEX idx_plan_steps_child_task ON plan_steps(child_task_id);
