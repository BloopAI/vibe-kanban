-- Add Clerk integration fields to team_members
ALTER TABLE team_members ADD COLUMN clerk_user_id TEXT;
ALTER TABLE team_members ADD COLUMN avatar_url TEXT;

-- Create index for fast Clerk user lookups
CREATE INDEX IF NOT EXISTS idx_team_members_clerk_user_id ON team_members(clerk_user_id);
