PRAGMA foreign_keys = ON;

CREATE TABLE execution_process_logs (
    execution_id      BLOB PRIMARY KEY,
    logs              TEXT NOT NULL,      -- JSONL format (one LogMsg per line)
    byte_size         INTEGER NOT NULL,
    inserted_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_process_logs_inserted_at ON execution_process_logs(inserted_at);
