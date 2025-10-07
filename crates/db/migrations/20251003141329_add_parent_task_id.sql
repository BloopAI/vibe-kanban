-- Add parent_task_id column to tasks table for hierarchical task relationships
-- This allows tasks to have parent tasks independent of task attempts
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id);

-- Create index for efficient querying of child tasks
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
