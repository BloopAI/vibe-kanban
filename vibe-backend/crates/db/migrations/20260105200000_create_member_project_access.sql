-- Member Project Access: Controls which projects each team member can access
CREATE TABLE IF NOT EXISTS member_project_access (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(member_id, project_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_member_project_access_member ON member_project_access(member_id);
CREATE INDEX IF NOT EXISTS idx_member_project_access_project ON member_project_access(project_id);
