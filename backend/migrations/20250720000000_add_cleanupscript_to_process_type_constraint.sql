-- Update CHECK constraint to include cleanupscript
PRAGMA foreign_keys = OFF;

-- Create new table with updated constraint
CREATE TABLE execution_processes_new (
    id                BLOB PRIMARY KEY,
    task_attempt_id   BLOB NOT NULL,
    process_type      TEXT NOT NULL DEFAULT 'setupscript'
                         CHECK (process_type IN ('setupscript','cleanupscript','codingagent','devserver')),
    status            TEXT NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running','completed','failed','killed')),
    command           TEXT NOT NULL,
    args              TEXT,  -- JSON array of arguments
    working_directory TEXT NOT NULL,
    stdout            TEXT,
    stderr            TEXT,
    exit_code         INTEGER,
    started_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    completed_at      TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    executor_type     TEXT,
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

-- Copy data from old table
INSERT INTO execution_processes_new SELECT * FROM execution_processes;

-- Drop old table
DROP TABLE execution_processes;

-- Rename new table
ALTER TABLE execution_processes_new RENAME TO execution_processes;

-- Recreate indexes
CREATE INDEX idx_execution_processes_task_attempt_id ON execution_processes(task_attempt_id);
CREATE INDEX idx_execution_processes_status ON execution_processes(status);
CREATE INDEX idx_execution_processes_type ON execution_processes(process_type);

PRAGMA foreign_keys = ON;
