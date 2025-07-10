-- Add setup completion tracking to task_attempts table
-- This enables automatic setup script execution for recreated worktrees
ALTER TABLE task_attempts ADD COLUMN setup_completed_at DATETIME;