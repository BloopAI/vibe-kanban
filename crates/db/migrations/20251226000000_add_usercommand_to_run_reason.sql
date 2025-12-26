-- Add 'usercommand' to the run_reason CHECK constraint
-- SQLite requires recreating the column to change CHECK constraints

-- 1. Add the replacement column with the wider CHECK
ALTER TABLE execution_processes
  ADD COLUMN run_reason_new TEXT NOT NULL DEFAULT 'setupscript'
    CHECK (run_reason_new IN ('setupscript',
                              'cleanupscript',
                              'codingagent',
                              'devserver',
                              'usercommand'));  -- new value

-- 2. Copy existing values across
UPDATE execution_processes
  SET run_reason_new = run_reason;

-- 3. Drop any indexes that mention the old column
DROP INDEX IF EXISTS idx_execution_processes_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_status_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_run_reason_created;

-- 4. Remove the old column
ALTER TABLE execution_processes DROP COLUMN run_reason;

-- 5. Rename the new column back to the canonical name
ALTER TABLE execution_processes
  RENAME COLUMN run_reason_new TO run_reason;

-- 6. Re-create the indexes
CREATE INDEX idx_execution_processes_run_reason
        ON execution_processes(run_reason);

CREATE INDEX idx_execution_processes_session_status_run_reason
        ON execution_processes(session_id, status, run_reason);

CREATE INDEX idx_execution_processes_session_run_reason_created
        ON execution_processes(session_id, run_reason, created_at DESC);
