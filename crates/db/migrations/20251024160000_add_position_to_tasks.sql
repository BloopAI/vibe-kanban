-- Add position column to tasks for drag-and-drop ordering
-- Position is a float to enable fractional indexing (inserting between tasks)
-- Default is 0.0 (constant required by SQLite for ALTER TABLE)
-- New tasks will have position set by application code to unixepoch

ALTER TABLE tasks ADD COLUMN position REAL NOT NULL DEFAULT 0.0;

-- Backfill existing tasks with their creation timestamp as position
-- This preserves chronological order (most recent tasks = highest position)
UPDATE tasks SET position = unixepoch(created_at, 'subsec');

-- Create index for efficient sorting by position within a project
-- Tasks are grouped by status on frontend, then sorted by position DESC
CREATE INDEX idx_tasks_position ON tasks(project_id, position DESC);
