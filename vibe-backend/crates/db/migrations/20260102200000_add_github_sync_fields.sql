-- Add sync configuration fields to github_repositories
ALTER TABLE github_repositories ADD COLUMN sync_path TEXT;
ALTER TABLE github_repositories ADD COLUMN sync_folder_id TEXT;
ALTER TABLE github_repositories ADD COLUMN last_synced_at DATETIME;

-- Create index for sync_folder_id lookups
CREATE INDEX IF NOT EXISTS idx_github_repositories_sync_folder_id ON github_repositories(sync_folder_id);
