-- Create github_connections table for storing GitHub PAT connections
CREATE TABLE github_connections (
    id              BLOB PRIMARY KEY,
    team_id         BLOB NOT NULL,
    access_token    TEXT NOT NULL,  -- GitHub Personal Access Token (should be encrypted in production)
    github_username TEXT,           -- GitHub username associated with token
    connected_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create github_repositories table for linked repos
CREATE TABLE github_repositories (
    id                  BLOB PRIMARY KEY,
    connection_id       BLOB NOT NULL,
    repo_full_name      TEXT NOT NULL,  -- e.g., "owner/repo"
    repo_name           TEXT NOT NULL,  -- e.g., "repo"
    repo_owner          TEXT NOT NULL,  -- e.g., "owner"
    repo_url            TEXT NOT NULL,
    default_branch      TEXT,
    is_private          INTEGER NOT NULL DEFAULT 0,
    linked_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (connection_id) REFERENCES github_connections(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX idx_github_connections_team_id ON github_connections(team_id);
CREATE INDEX idx_github_repositories_connection_id ON github_repositories(connection_id);
CREATE UNIQUE INDEX idx_github_repositories_unique ON github_repositories(connection_id, repo_full_name);
