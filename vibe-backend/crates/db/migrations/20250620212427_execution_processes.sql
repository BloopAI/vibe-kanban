PRAGMA foreign_keys = ON;

CREATE TABLE execution_processes (
    id                BLOB PRIMARY KEY,
    task_attempt_id   BLOB NOT NULL,
    process_type      TEXT NOT NULL DEFAULT 'setupscript'
                         CHECK (process_type IN ('setupscript','codingagent','devserver')),
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
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_processes_task_attempt_id ON execution_processes(task_attempt_id);
CREATE INDEX idx_execution_processes_status ON execution_processes(status);
CREATE INDEX idx_execution_processes_type ON execution_processes(process_type);
