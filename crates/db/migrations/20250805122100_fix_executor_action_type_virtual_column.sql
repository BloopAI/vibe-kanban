-- Drop the existing virtual column and index
DROP INDEX IF EXISTS idx_execution_processes_task_attempt_type_created;
ALTER TABLE execution_processes DROP COLUMN executor_action_type;

-- Recreate the virtual column with the correct JSON path
ALTER TABLE execution_processes
ADD COLUMN executor_action_type TEXT
  GENERATED ALWAYS AS (json_extract(executor_action, '$.typ.type')) VIRTUAL;

-- Recreate the index
CREATE INDEX idx_execution_processes_task_attempt_type_created
ON execution_processes (task_attempt_id, executor_action_type, created_at DESC);
