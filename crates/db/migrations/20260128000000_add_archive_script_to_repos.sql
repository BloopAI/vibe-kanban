-- Add archive_script column to repos table
-- This script runs when a workspace is being archived
ALTER TABLE repos ADD COLUMN archive_script TEXT;

-- Remove the CHECK constraint from run_reason by recreating the column without it.
-- The Rust enum already enforces valid values, so the constraint is redundant.
-- This avoids the complex column-swap dance every time we add a new run_reason value.

ALTER TABLE execution_processes ADD COLUMN run_reason_new TEXT NOT NULL DEFAULT 'setupscript';
UPDATE execution_processes SET run_reason_new = run_reason;

DROP INDEX IF EXISTS idx_execution_processes_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_status_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_run_reason_created;

ALTER TABLE execution_processes DROP COLUMN run_reason;
ALTER TABLE execution_processes RENAME COLUMN run_reason_new TO run_reason;

CREATE INDEX idx_execution_processes_run_reason ON execution_processes(run_reason);
CREATE INDEX idx_execution_processes_session_status_run_reason ON execution_processes (session_id, status, run_reason);
CREATE INDEX idx_execution_processes_session_run_reason_created ON execution_processes (session_id, run_reason, created_at DESC);
