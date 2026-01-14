-- Add workspace flags for archived, pinned, and name
ALTER TABLE workspaces ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN name TEXT;

-- Archive workspaces for completed/cancelled tasks
UPDATE workspaces
SET archived = 1
WHERE task_id IN (
    SELECT id FROM tasks WHERE status IN ('done', 'cancelled')
);
