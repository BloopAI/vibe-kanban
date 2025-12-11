-- Add release_ports_on_completion column to projects table
-- When enabled (or NULL, which defaults to enabled), assigned ports are automatically released when a task is completed
ALTER TABLE projects ADD COLUMN release_ports_on_completion BOOLEAN;
