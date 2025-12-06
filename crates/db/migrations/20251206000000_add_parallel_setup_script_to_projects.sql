-- Add parallel_setup_script column to projects table
-- When true, setup script runs in parallel with coding agent instead of sequentially
ALTER TABLE projects ADD COLUMN parallel_setup_script INTEGER NOT NULL DEFAULT 0;
