-- Remove unused executor_type column from execution_processes
ALTER TABLE execution_processes DROP COLUMN executor_type;

ALTER TABLE task_attempts RENAME COLUMN executor TO base_coding_agent;

