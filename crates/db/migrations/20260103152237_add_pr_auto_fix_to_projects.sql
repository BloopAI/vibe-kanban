-- Add pr_auto_fix_enabled to projects (default false)
-- When enabled, the PR monitor will auto-prompt the agent when CI fails or PR has conflicts
ALTER TABLE projects ADD COLUMN pr_auto_fix_enabled BOOLEAN NOT NULL DEFAULT FALSE;
