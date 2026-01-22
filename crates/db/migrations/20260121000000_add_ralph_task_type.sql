-- Add task_type column to tasks table for Ralph and future task types
ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'default';

-- Add Ralph-specific columns
ALTER TABLE tasks ADD COLUMN ralph_current_story_index INTEGER;
ALTER TABLE tasks ADD COLUMN ralph_auto_continue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN ralph_max_iterations INTEGER NOT NULL DEFAULT 10;

-- Create index for task_type queries
CREATE INDEX idx_tasks_task_type ON tasks(task_type);
