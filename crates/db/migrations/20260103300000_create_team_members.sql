-- Create team_members table for storing team membership with roles
CREATE TABLE team_members (
    id          BLOB PRIMARY KEY,
    team_id     BLOB NOT NULL,
    email       TEXT NOT NULL,
    display_name TEXT,
    role        TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('viewer', 'contributor', 'maintainer', 'owner')),
    invited_by  BLOB,
    joined_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(team_id, email),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_email ON team_members(email);
