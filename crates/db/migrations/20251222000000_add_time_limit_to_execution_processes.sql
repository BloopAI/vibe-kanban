-- Add time limit configuration to execution_processes
-- time_limit_seconds: NULL means no limit, otherwise specifies max execution time in seconds
ALTER TABLE execution_processes ADD COLUMN time_limit_seconds INTEGER;

-- Add timebounded status to execution_process_status constraint
-- First, we need to drop and recreate the constraint since SQLite doesn't support ALTER COLUMN
-- We'll use a workaround: create a new table, copy data, drop old, rename new
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Create new table with updated constraint
CREATE TABLE execution_processes_new (
    id              BLOB PRIMARY KEY,
    session_id      BLOB NOT NULL,
    run_reason      TEXT NOT NULL DEFAULT 'setupscript'
                       CHECK (run_reason IN ('setupscript','codingagent','devserver','cleanupscript')),
    executor_action TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running','completed','failed','killed','timebounded')),
    exit_code       INTEGER,
    dropped         INTEGER NOT NULL DEFAULT 0,
    time_limit_seconds INTEGER,
    started_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Copy data from old table
INSERT INTO execution_processes_new 
SELECT * FROM execution_processes;

-- Drop old table and rename new one
DROP TABLE execution_processes;
ALTER TABLE execution_processes_new RENAME TO execution_processes;

-- Recreate indexes
CREATE INDEX idx_execution_processes_session_id ON execution_processes(session_id);
CREATE INDEX idx_execution_processes_status ON execution_processes(status);
CREATE INDEX idx_execution_processes_run_reason ON execution_processes(run_reason);
CREATE INDEX idx_execution_processes_session_status_run_reason
ON execution_processes (session_id, status, run_reason);
CREATE INDEX idx_execution_processes_session_run_reason_created
ON execution_processes (session_id, run_reason, created_at DESC);

COMMIT;

PRAGMA foreign_keys = ON;
