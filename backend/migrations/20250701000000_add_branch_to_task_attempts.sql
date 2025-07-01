-- Add branch column to task_attempts table
ALTER TABLE task_attempts ADD COLUMN branch TEXT NOT NULL DEFAULT '';
