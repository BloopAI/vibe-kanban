-- Add priority column to tasks for task prioritization

ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL';
