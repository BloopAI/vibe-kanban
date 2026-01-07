-- Add worktree_cleanup_script column to projects table
-- This script runs once per cleanup event (not per-repo) before worktrees are removed
ALTER TABLE projects ADD COLUMN worktree_cleanup_script TEXT;
