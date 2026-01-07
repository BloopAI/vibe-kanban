-- Add auto PR settings to projects
-- NULL means "use global setting", 0/1 means override (disabled/enabled)
ALTER TABLE projects ADD COLUMN auto_pr_on_review_enabled INTEGER DEFAULT NULL;
ALTER TABLE projects ADD COLUMN auto_pr_draft INTEGER DEFAULT NULL;
