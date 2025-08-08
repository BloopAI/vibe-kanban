-- Add profile_label column to task_attempts table to track which profile was used
-- Default to empty string for existing records
ALTER TABLE task_attempts ADD COLUMN profile_label TEXT NOT NULL DEFAULT '';