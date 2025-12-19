CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id_created_at
ON sessions (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
ON projects (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspaces_container_ref
ON workspaces (container_ref)
WHERE container_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eprs_process_repo
ON execution_process_repo_states (execution_process_id, repo_id);

PRAGMA optimize;
