ALTER TABLE execution_processes
ADD COLUMN executor_action_type TEXT
  GENERATED ALWAYS AS (json_extract(executor_action, '$.type')) VIRTUAL;

CREATE INDEX idx_execution_processes_task_attempt_type_created
ON execution_processes (task_attempt_id, executor_action_type, created_at DESC);