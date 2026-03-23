CREATE INDEX idx_sessions_executor_updated_at ON sessions(updated_at, executor);

PRAGMA optimize;
