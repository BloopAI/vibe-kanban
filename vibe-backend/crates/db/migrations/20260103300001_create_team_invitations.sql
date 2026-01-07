-- Create team_invitations table for pending invitations
CREATE TABLE team_invitations (
    id          BLOB PRIMARY KEY,
    team_id     BLOB NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('viewer', 'contributor', 'maintainer', 'owner')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
    invited_by  BLOB,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
CREATE INDEX idx_team_invitations_status ON team_invitations(status);

-- Unique constraint: only one pending invitation per email per team
CREATE UNIQUE INDEX idx_team_invitations_pending ON team_invitations(team_id, email) WHERE status = 'pending';
