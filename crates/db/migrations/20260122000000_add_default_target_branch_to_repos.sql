-- Add default_target_branch column to repos table
ALTER TABLE repos ADD COLUMN default_target_branch TEXT;
