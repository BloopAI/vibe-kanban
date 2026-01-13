-- Add metadata fields to tasks table for Linear-style card display
-- task_number: auto-incrementing per project for ID prefix display (e.g., VIB-123)
-- priority: task priority level
-- due_date: optional due date
-- labels: JSON array of label objects with name and color

-- Add task_number column with default NULL for existing tasks
ALTER TABLE tasks ADD COLUMN task_number INTEGER;

-- Add priority column with default 'none'
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'
    CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent'));

-- Add due_date column (optional)
ALTER TABLE tasks ADD COLUMN due_date TEXT;

-- Add labels as JSON array (optional)
ALTER TABLE tasks ADD COLUMN labels TEXT DEFAULT '[]';

-- Create index for faster lookups when generating task numbers
CREATE INDEX IF NOT EXISTS idx_tasks_project_task_number ON tasks(project_id, task_number);

-- Populate task_number for existing tasks based on creation order within each project
WITH numbered_tasks AS (
    SELECT
        id,
        project_id,
        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC) as new_number
    FROM tasks
)
UPDATE tasks
SET task_number = (
    SELECT new_number
    FROM numbered_tasks
    WHERE numbered_tasks.id = tasks.id
);

-- Add prefix column to projects for task ID prefix (e.g., "VIB", "PRJ")
ALTER TABLE projects ADD COLUMN task_prefix TEXT;

-- Set default prefixes for existing projects based on first 3 letters of name (uppercase)
UPDATE projects
SET task_prefix = UPPER(SUBSTR(REPLACE(name, ' ', ''), 1, 3))
WHERE task_prefix IS NULL;
