-- Add slash_command column to task_attempts table
ALTER TABLE task_attempts ADD COLUMN slash_command TEXT DEFAULT NULL;