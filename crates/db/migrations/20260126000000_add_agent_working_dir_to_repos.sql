-- Add default_working_dir to repos for monorepo support
-- Allows users to specify the subdirectory where the coding agent should run
ALTER TABLE repos ADD COLUMN default_working_dir TEXT;
