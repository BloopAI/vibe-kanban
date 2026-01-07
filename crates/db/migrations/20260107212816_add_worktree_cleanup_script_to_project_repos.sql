-- Add worktree_cleanup_script column to project_repos table
-- This script runs once per-repo before worktrees are removed (e.g., when a task is deleted)
-- Use it for cleanup tasks like stopping Docker containers or deleting databases
ALTER TABLE project_repos ADD COLUMN worktree_cleanup_script TEXT;
