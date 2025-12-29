-- Add team_id column to tasks table
-- This allows tasks/issues to be associated with teams (Linear-style)
ALTER TABLE tasks ADD COLUMN team_id BLOB REFERENCES teams(id) ON DELETE SET NULL;

-- Create index for faster team-based task queries
CREATE INDEX idx_tasks_team_id ON tasks(team_id);
