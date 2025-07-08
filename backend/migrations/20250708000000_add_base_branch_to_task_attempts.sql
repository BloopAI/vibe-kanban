-- Add base_branch column to task_attempts table with default value
ALTER TABLE task_attempts ADD COLUMN base_branch TEXT NOT NULL DEFAULT 'main';
