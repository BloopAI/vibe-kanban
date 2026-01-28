-- Add 'archivescript' to the run_reason CHECK constraint
-- Following pattern from 20250720000000_add_cleanupscript_to_process_type_constraint.sql
-- Note: The column was renamed from process_type to run_reason in migration 20250730000001

-- 1. Add the replacement column with the wider CHECK
ALTER TABLE execution_processes
  ADD COLUMN run_reason_new TEXT NOT NULL DEFAULT 'setupscript'
    CHECK (run_reason_new IN ('setupscript',
                               'cleanupscript',
                               'archivescript',   -- new value
                               'codingagent',
                               'devserver'));

-- 2. Copy existing values across
UPDATE execution_processes
  SET run_reason_new = run_reason;

-- 3. Drop any indexes that reference run_reason
DROP INDEX IF EXISTS idx_execution_processes_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_status_run_reason;
DROP INDEX IF EXISTS idx_execution_processes_session_run_reason_created;

-- 4. Remove the old column (requires 3.35+)
ALTER TABLE execution_processes DROP COLUMN run_reason;

-- 5. Rename the new column back to the canonical name
ALTER TABLE execution_processes
  RENAME COLUMN run_reason_new TO run_reason;

-- 6. Re-create all indexes
CREATE INDEX idx_execution_processes_run_reason
        ON execution_processes(run_reason);

CREATE INDEX idx_execution_processes_session_status_run_reason
        ON execution_processes (session_id, status, run_reason);

CREATE INDEX idx_execution_processes_session_run_reason_created
        ON execution_processes (session_id, run_reason, created_at DESC);
