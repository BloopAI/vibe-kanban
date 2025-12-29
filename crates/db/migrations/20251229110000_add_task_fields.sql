-- Add priority, due_date, and assignee_id fields to tasks table for Linear-style features

-- Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 0;

-- Due date for task deadlines
ALTER TABLE tasks ADD COLUMN due_date TEXT;

-- Assignee (references a user/member)
ALTER TABLE tasks ADD COLUMN assignee_id BLOB;

-- Create index for due_date queries
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Create index for assignee queries
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);

-- Create index for priority queries
CREATE INDEX idx_tasks_priority ON tasks(priority);
