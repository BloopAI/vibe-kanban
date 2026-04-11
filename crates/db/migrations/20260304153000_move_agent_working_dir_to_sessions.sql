-- Move agent_working_dir ownership from workspaces to sessions.
-- Session working dir is backend-computed at session creation time.

ALTER TABLE sessions ADD COLUMN agent_working_dir TEXT;

-- Backfill existing sessions from workspace snapshot
UPDATE sessions
SET agent_working_dir = (
    SELECT w.agent_working_dir
    FROM workspaces w
    WHERE w.id = sessions.workspace_id
);

ALTER TABLE workspaces DROP COLUMN agent_working_dir;
