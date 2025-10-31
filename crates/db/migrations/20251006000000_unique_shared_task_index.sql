-- Ensure each shared task links to at most one local task by ignoring NULL shared_task_id values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_shared_task_unique
    ON tasks(shared_task_id)
    WHERE shared_task_id IS NOT NULL;

