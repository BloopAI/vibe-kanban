-- Create team_repos table for team-level repository configuration
-- This mirrors project_repos structure to enable agent execution for team tasks
CREATE TABLE team_repos (
    id                    BLOB PRIMARY KEY,
    team_id               BLOB NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    repo_id               BLOB NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    setup_script          TEXT,
    cleanup_script        TEXT,
    copy_files            TEXT,
    parallel_setup_script INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (team_id, repo_id)
);

CREATE INDEX idx_team_repos_team_id ON team_repos(team_id);
CREATE INDEX idx_team_repos_repo_id ON team_repos(repo_id);
