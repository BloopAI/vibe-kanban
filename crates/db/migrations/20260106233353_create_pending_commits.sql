-- tabla para commits pendientes cuando el modo de commit es Manual
-- el usuario debe proveer el título del commit antes de que se ejecute
CREATE TABLE IF NOT EXISTS pending_commits (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    repo_path TEXT NOT NULL,
    diff_summary TEXT NOT NULL,
    agent_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS idx_pending_commits_workspace_id ON pending_commits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pending_commits_created_at ON pending_commits(created_at);
