PRAGMA foreign_keys = ON;

-- Add parent_task_attempt column to tasks table
ALTER TABLE tasks ADD COLUMN parent_task_attempt BLOB REFERENCES task_attempts(id);

-- Create index for parent_task_attempt lookups
CREATE INDEX idx_tasks_parent_task_attempt ON tasks(parent_task_attempt);