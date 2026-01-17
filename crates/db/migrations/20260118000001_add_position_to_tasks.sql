-- Add position field to tasks table for ordering tasks in a list
-- Position is nullable to support existing tasks without explicit ordering

ALTER TABLE tasks ADD COLUMN position INTEGER;

-- Create index for efficient ordering by position within a project
CREATE INDEX idx_tasks_project_position ON tasks(project_id, position);
