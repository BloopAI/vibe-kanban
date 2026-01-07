-- Multi-folder sync configuration for GitHub repositories
CREATE TABLE IF NOT EXISTS github_repo_sync_configs (
    id BLOB PRIMARY KEY NOT NULL,
    repo_id BLOB NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL,  -- References document_folders.id
    github_path TEXT,         -- Path in repo (null = use folder name)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(repo_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_configs_repo ON github_repo_sync_configs(repo_id);
CREATE INDEX IF NOT EXISTS idx_sync_configs_folder ON github_repo_sync_configs(folder_id);
