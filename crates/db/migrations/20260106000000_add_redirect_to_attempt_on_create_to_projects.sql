-- Add redirect_to_attempt_on_create to projects
-- NULL means "use global setting", TRUE/FALSE means override
ALTER TABLE projects ADD COLUMN redirect_to_attempt_on_create INTEGER DEFAULT NULL;
