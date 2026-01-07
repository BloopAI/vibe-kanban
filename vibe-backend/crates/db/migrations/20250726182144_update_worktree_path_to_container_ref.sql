-- Add migration script here

ALTER TABLE task_attempts ADD COLUMN container_ref TEXT;  -- nullable
UPDATE task_attempts SET container_ref = worktree_path;

-- If you might have triggers or indexes on worktree_path, drop them before this step.

ALTER TABLE task_attempts DROP COLUMN worktree_path;