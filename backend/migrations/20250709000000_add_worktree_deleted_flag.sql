-- Add worktree_deleted flag to track when worktrees are cleaned up
ALTER TABLE task_attempts ADD COLUMN worktree_deleted BOOLEAN NOT NULL DEFAULT FALSE;