-- Add copy_files column to projects table
-- This field stores comma-separated file paths to copy from the original project directory to the worktree
ALTER TABLE projects ADD COLUMN copy_files TEXT;