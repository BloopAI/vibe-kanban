-- Add git_auto_commit_enabled to projects
-- NULL means "use global setting", TRUE/FALSE means override
ALTER TABLE projects ADD COLUMN git_auto_commit_enabled INTEGER DEFAULT NULL;
