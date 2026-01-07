-- Add token column to team_invitations for shareable invite links
-- Note: SQLite doesn't support adding UNIQUE constraint via ALTER TABLE,
-- so we add the column and create a unique index separately
ALTER TABLE team_invitations ADD COLUMN token TEXT;

-- Create unique index for faster token lookups and uniqueness constraint
CREATE UNIQUE INDEX idx_team_invitations_token ON team_invitations(token) WHERE token IS NOT NULL;
