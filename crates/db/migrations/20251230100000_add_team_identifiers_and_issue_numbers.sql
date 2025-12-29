-- Add identifier field to teams for issue prefixes (e.g., "VIB" for vibe-kanban)
ALTER TABLE teams ADD COLUMN identifier TEXT;

-- Add issue_number field to tasks for sequential numbering per team
ALTER TABLE tasks ADD COLUMN issue_number INTEGER;

-- Create index for faster lookups by team issue number
CREATE INDEX idx_tasks_team_issue_number ON tasks(team_id, issue_number);

-- Create unique index to ensure unique issue numbers per team
CREATE UNIQUE INDEX idx_tasks_team_issue_unique ON tasks(team_id, issue_number) WHERE team_id IS NOT NULL AND issue_number IS NOT NULL;
