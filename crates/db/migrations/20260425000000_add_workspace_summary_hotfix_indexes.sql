CREATE INDEX IF NOT EXISTS idx_coding_agent_turns_seen_execution_process_id
ON coding_agent_turns (seen, execution_process_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_archived_updated_at
ON workspaces (archived, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspaces_archived_created_at
ON workspaces (archived, created_at DESC);

PRAGMA optimize;
