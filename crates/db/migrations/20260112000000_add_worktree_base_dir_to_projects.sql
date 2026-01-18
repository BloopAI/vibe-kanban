-- Add worktree_base_dir column to projects table
-- This allows users to configure a custom base directory for git worktrees per project
-- NULL means use the system default (temporary directory)
-- Supports absolute paths and tilde expansion (e.g., ~/worktrees)

ALTER TABLE projects ADD COLUMN worktree_base_dir TEXT DEFAULT NULL;
