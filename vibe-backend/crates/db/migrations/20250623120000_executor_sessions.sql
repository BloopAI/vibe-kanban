PRAGMA foreign_keys = ON;

CREATE TABLE executor_sessions (
    id                    BLOB PRIMARY KEY,
    task_attempt_id       BLOB NOT NULL,
    execution_process_id  BLOB NOT NULL,
    session_id            TEXT,  -- External session ID from Claude/Amp
    prompt                TEXT,  -- The prompt sent to the executor
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

CREATE INDEX idx_executor_sessions_task_attempt_id ON executor_sessions(task_attempt_id);
CREATE INDEX idx_executor_sessions_execution_process_id ON executor_sessions(execution_process_id);
CREATE INDEX idx_executor_sessions_session_id ON executor_sessions(session_id);
