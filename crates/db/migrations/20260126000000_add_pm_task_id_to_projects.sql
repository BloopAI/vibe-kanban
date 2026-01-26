-- Add pm_task_id column to projects table
-- This links a project to its "PM Task" which contains project specs and serves as the PM AI context

ALTER TABLE projects ADD COLUMN pm_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_projects_pm_task_id ON projects(pm_task_id);
