PRAGMA foreign_keys = ON;

-- 1) task_attempts: filter by task_id and sort by created_at DESC
CREATE INDEX IF NOT EXISTS idx_task_attempts_task_id_created_at
ON task_attempts (task_id, created_at DESC);

-- Global listing ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_task_attempts_created_at
ON task_attempts (created_at DESC);

-- 2) execution_processes: filter by task_attempt_id and sort by created_at ASC
CREATE INDEX IF NOT EXISTS idx_execution_processes_task_attempt_created_at
ON execution_processes (task_attempt_id, created_at ASC);

-- Drop redundant single-column index superseded by the composite above
DROP INDEX IF EXISTS idx_execution_processes_task_attempt_id;

-- 3) tasks: list by project ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_tasks_project_created_at
ON tasks (project_id, created_at DESC);

