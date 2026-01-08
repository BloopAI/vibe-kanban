-- Add default_branch column to project_repos table
-- This allows users to configure which branch to use as the default for new task attempts
-- When NULL, the system will auto-detect from remote HEAD or fall back to current branch
ALTER TABLE project_repos ADD COLUMN default_branch TEXT;
